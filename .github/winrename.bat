@echo off
set "str1= Setup "
set "str2=-"
Setlocal Enabledelayedexpansion
for /f "delims=" %%i in ('dir /b *.*') do (
set "var=%%i" & ren "%%i" "!var:%str1%=%str2%!")
