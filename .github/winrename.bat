@echo off
set "str1= Setup "
set "str2=-"
set "str3=.exe"
Setlocal Enabledelayedexpansion
for /f "delims=" %%i in ('dir /b *.*') do (
set "var=%%i" & set "var2=!var:%str3%=_%1%str3%!" & ren "%%i" "!var2:%str1%=%str2%!")
