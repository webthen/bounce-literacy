@echo off
chcp 65001 >nul
echo ========================================================
echo   正在启动《弹弹识字》V1
echo ========================================================

where npm >nul 2>nul
if %errorlevel% equ 0 (
    echo [1/2] 正在启动 Vite 本地开发服务器 (热重载 / WebGL 渲染)...
    start /b npm run dev >nul 2>nul
    timeout /t 2 >nul
    echo [2/2] 正在浏览器中打开 http://localhost:8088/ ...
    start "" "http://localhost:8088/"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        echo 启动内置 HTTP 服务查看 dist 生产包...
        start /b python -m http.server 8088 -d dist >nul 2>nul
        timeout /t 1 >nul
        start "" "http://localhost:8088/"
    ) else (
        echo 直接在浏览器中打开预构建包...
        start "" "%~dp0dist\index.html"
    )
)

echo.
echo ========================================================
echo   游戏已成功在浏览器中启动！
echo   - 渲染内核: Pixi.js v7 (WebGL 硬件加速 / 120FPS 满帧)
echo   - 支持手机/平板模拟器横屏测试与全屏沉浸
echo ========================================================
echo.
pause
