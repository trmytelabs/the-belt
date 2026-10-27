@echo off
REM Run once on the owner's PC once the server accepts this key (thebelt_deploy.pub). Stores the belt's deploy secrets in
REM the repository's "production" environment. Usage: set-github-secrets.cmd [server host or IP]
REM The host must be the server itself (not the Cloudflare-proxied name): SSH does not go through Cloudflare.
setlocal
set REPO=trmytelabs/the-belt
set HOST=%~1
if "%HOST%"=="" set HOST=104.225.217.90
set KEY=%USERPROFILE%\.ssh\thebelt_deploy
if not exist "%KEY%" ( echo missing %KEY%: ssh-keygen -t ed25519 -f "%KEY%" -C thebelt-deploy@belt-pc & exit /b 1 )
gh api -X PUT repos/%REPO%/environments/production >nul || exit /b 1
gh secret set DEPLOY_HOST --repo %REPO% --env production --body "%HOST%" || exit /b 1
gh secret set DEPLOY_USER --repo %REPO% --env production --body deploy || exit /b 1
gh secret set DEPLOY_SSH_KEY --repo %REPO% --env production < "%KEY%" || exit /b 1
ssh-keyscan -t ed25519 %HOST% > "%TEMP%\belt_known_hosts" 2>nul
gh secret set DEPLOY_KNOWN_HOSTS --repo %REPO% --env production < "%TEMP%\belt_known_hosts" || exit /b 1
del "%TEMP%\belt_known_hosts"
gh secret list --repo %REPO% --env production
echo Secrets set. Push to main, or run "Deploy to the server" from the Actions tab, to deploy.
