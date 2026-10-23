import type { DataConnection, MediaConnection, Peer } from 'peerjs';

import { PEER_PREFIX, readGuestMessage, readHostMessage, type GuestMessage, type HostMessage } from './onlineRules';

/**
 * How the two browsers find each other. On the live game, PeerJS's free public server introduces them and they then
 * talk directly (WebRTC: the picture, the sound and the controls never pass through a server of ours; there is
 * none). Voice chat rides the same link: each microphone goes straight to the other player. `?online=local` instead links two tabs of one browser through a BroadcastChannel, with no picture: for the
 * browser tests, and for trying it out on one computer. PeerJS is only loaded when someone hosts or joins.
 */
export type OnlineTransport = 'peer' | 'local';

export function transportFromUrl(search = window.location.search): OnlineTransport {
  return new URLSearchParams(search).get('online') === 'local' ? 'local' : 'peer';
}

type Envelope = { from: 'host' | 'guest'; payload: unknown };
const localChannel = (code: string): BroadcastChannel => new BroadcastChannel(`the-belt-online-${code}`);

async function openPeer(id?: string): Promise<Peer> {
  const { Peer: PeerClass } = await import('peerjs');
  const peer = id ? new PeerClass(id, { debug: 0 }) : new PeerClass({ debug: 0 });
  // The connection service has 12 seconds to answer.
  await new Promise<void>((resolve, reject) => {
    const late = window.setTimeout(() => { peer.destroy(); reject(new Error('The connection service did not answer')); }, 12_000);
    peer.once('open', () => { window.clearTimeout(late); resolve(); });
    peer.once('error', (error) => { window.clearTimeout(late); reject(error); });
  });
  // Losing the connection service later leaves the players' own link alone; this only re-registers the room.
  peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  return peer;
}

/** A microphone for voice chat, with the browser's echo and noise handling; null if there is none or it is refused. */
export async function openMicrophone(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return null;
  }
}

/** Turns a microphone on or off (off sends silence; the link stays up). */
export function setMicrophone(microphone: MediaStream | null, on: boolean): void {
  for (const track of microphone?.getAudioTracks() ?? []) track.enabled = on;
}

/** The host's side: one joining player at a time, their messages checked, and the picture sent once shared. */
export class OnlineHost {
  public readonly code: string;
  public readonly transport: OnlineTransport;
  /** A player has joined (and not left). */
  public joined = false;
  /** What the joining player sees: this tab with its HUD and sound, or just the 3D view. */
  public picture: 'tab' | '3d' | null = null;
  public onMessage: (message: GuestMessage) => void = () => {};
  public onChange: () => void = () => {};
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private call: MediaConnection | null = null;
  /** The joining player's voice: a call of their own, made once their microphone is allowed. */
  private voiceCall: MediaConnection | null = null;
  private local: BroadcastChannel | null = null;
  private stream: MediaStream | null = null;
  /** The game's sound with the host's voice mixed in, sent with the picture. */
  private sound: MediaStream | null = null;
  /** The joining player's voice, played here. */
  private readonly voice = new Audio();

  private constructor(code: string, transport: OnlineTransport) {
    this.code = code;
    this.transport = transport;
  }

  /** Opens a room under `code`; rejects if the code is taken (try another) or the service cannot be reached. */
  public static async open(code: string, transport: OnlineTransport): Promise<OnlineHost> {
    const host = new OnlineHost(code, transport);
    if (transport === 'local') {
      const channel = localChannel(code);
      channel.onmessage = (event: MessageEvent<Envelope>) => {
        if (event.data?.from !== 'guest') return;
        host.receive(event.data.payload);
      };
      host.local = channel;
      return host;
    }
    const peer = await openPeer(PEER_PREFIX + code);
    host.peer = peer;
    peer.on('connection', (connection) => {
      // A rejoin (a reload on the other end) replaces the old link.
      host.connection?.close();
      host.connection = connection;
      connection.on('data', (data) => host.receive(data));
      connection.on('close', () => {
        if (host.connection !== connection) return;
        host.connection = null;
        host.joined = false;
        host.onChange();
      });
      connection.on('open', () => { if (host.stream) host.sendPicture(); });
    });
    // The joining player's voice, from the player who joined (anyone else's call is turned away).
    peer.on('call', (call) => {
      if (call.peer !== host.connection?.peer) { call.close(); return; }
      host.voiceCall?.close();
      host.voiceCall = call;
      call.answer();
      call.on('stream', (voice) => {
        if (host.voice.srcObject === voice) return;
        host.voice.srcObject = voice;
        void host.voice.play().catch(() => undefined);
      });
    });
    return host;
  }

  private receive(data: unknown): void {
    const message = readGuestMessage(data);
    if (!message) return;
    if (message.t === 'hello' && !this.joined) {
      this.joined = true;
      this.onChange();
      if (this.stream) this.sendPicture();
    }
    this.onMessage(message);
  }

  public send(message: HostMessage): void {
    if (this.local) this.local.postMessage({ from: 'host', payload: message } satisfies Envelope);
    else if (this.connection?.open) void this.connection.send(message);
  }

  /**
   * Shares this tab's picture (the 3D view, the HUD and the speech): the browser asks which tab, offering this one.
   * The sound goes separately (`useSound`). False if the player says no, or the browser cannot share a tab.
   */
  public async shareTab(): Promise<boolean> {
    if (!navigator.mediaDevices?.getDisplayMedia) return false;
    try {
      const options = {
        video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1280 }, height: { max: 720 } },
        audio: false,
        preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions;
      this.usePicture(await navigator.mediaDevices.getDisplayMedia(options), 'tab');
      return true;
    } catch {
      return false;
    }
  }

  /** Just the 3D view, without the HUD or speech: for a browser that cannot share a tab. */
  public shareView(canvas: HTMLCanvasElement): void {
    this.usePicture(canvas.captureStream(30), '3d');
  }

  /** The game's sound, with the host's voice mixed in (DepotAudio.broadcast), to go with the picture. */
  public useSound(sound: MediaStream | null): void {
    this.sound = sound;
    if (this.stream) this.sendPicture();
  }

  private usePicture(stream: MediaStream, picture: 'tab' | '3d'): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = stream;
    this.picture = picture;
    for (const track of stream.getVideoTracks()) {
      track.contentHint = 'motion';
      // The browser's own STOP SHARING ends the picture; it can be shared again from the menu.
      track.addEventListener('ended', () => {
        if (this.stream !== stream) return;
        this.stream = null;
        this.picture = null;
        this.onChange();
      });
    }
    this.sendPicture();
    this.onChange();
  }

  private sendPicture(): void {
    if (!this.peer || !this.stream || !this.connection?.open) return;
    this.call?.close();
    const outgoing = new MediaStream([...this.stream.getVideoTracks(), ...(this.sound?.getAudioTracks() ?? [])]);
    const call = this.peer.call(this.connection.peer, outgoing);
    this.call = call;
    // A steady 30 frames at up to 2.5 Mbit/s: smooth enough to play by, without swamping a home upload.
    const sender = call.peerConnection?.getSenders().find((candidate) => candidate.track?.kind === 'video');
    if (sender) {
      const parameters = sender.getParameters();
      parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      parameters.encodings[0].maxBitrate = 2_500_000;
      parameters.encodings[0].maxFramerate = 30;
      parameters.degradationPreference = 'maintain-framerate';
      void sender.setParameters(parameters).catch(() => undefined);
    }
  }

  public close(): void {
    this.send({ t: 'bye' });
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.call?.close();
    this.voiceCall?.close();
    this.connection?.close();
    this.peer?.destroy();
    this.local?.close();
    this.voice.srcObject = null;
    this.joined = false;
    this.picture = null;
  }
}

/** The joining player's side: their controls out, the host's picture and turn in. */
export class OnlineGuest {
  public onMessage: (message: HostMessage) => void = () => {};
  public onStream: (stream: MediaStream) => void = () => {};
  public onState: (state: 'connected' | 'lost' | 'no-host' | 'failed') => void = () => {};
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private local: BroadcastChannel | null = null;

  /**
   * `microphone` (asked for alongside, so the picture never waits on its prompt) is this player's voice: once it is
   * allowed and the link is up, it goes to the host on a call of its own.
   */
  public static async join(code: string, transport: OnlineTransport, microphone: Promise<MediaStream | null> = Promise.resolve(null)): Promise<OnlineGuest> {
    const guest = new OnlineGuest();
    if (transport === 'local') {
      const channel = localChannel(code);
      // Hello until the host answers (it may open its room a moment later).
      let waiting = true;
      const hello = window.setInterval(() => guest.send({ t: 'hello', v: 1 }), 1000);
      channel.onmessage = (event: MessageEvent<Envelope>) => {
        if (event.data?.from !== 'host') return;
        const message = readHostMessage(event.data.payload);
        if (!message) return;
        if (waiting) {
          waiting = false;
          window.clearInterval(hello);
          guest.onState('connected');
        }
        guest.onMessage(message);
      };
      guest.local = channel;
      queueMicrotask(() => guest.send({ t: 'hello', v: 1 }));
      return guest;
    }
    const peer = await openPeer();
    guest.peer = peer;
    peer.on('error', (error) => guest.onState(error.type === 'peer-unavailable' ? 'no-host' : 'failed'));
    peer.on('call', (call) => {
      call.answer();
      call.on('stream', (stream) => guest.onStream(stream));
    });
    const connection = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    guest.connection = connection;
    connection.on('open', () => {
      guest.send({ t: 'hello', v: 1 });
      guest.onState('connected');
      void microphone.then((voice) => { if (voice && !peer.destroyed) peer.call(PEER_PREFIX + code, voice); });
    });
    connection.on('data', (data) => {
      const message = readHostMessage(data);
      if (message) guest.onMessage(message);
    });
    connection.on('close', () => guest.onState('lost'));
    return guest;
  }

  public send(message: GuestMessage): void {
    if (this.local) this.local.postMessage({ from: 'guest', payload: message } satisfies Envelope);
    else if (this.connection?.open) void this.connection.send(message);
  }

  public close(): void {
    this.connection?.close();
    this.peer?.destroy();
    this.local?.close();
  }
}
