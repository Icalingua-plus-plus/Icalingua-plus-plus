# Maintainer: Clansty <i@gao4.pw>
pkgname=electron-qq
pkgver=1.2.3
pkgrel=1
pkgdesc='A cross-plantform QQ made with Electron'
license=('GPL')
depends=('electron')
arch=('any')
source=(build/linux-unpacked/resources/app.asar
        static/512x512.png
        electron-qq.desktop)

package() {
  install -Dm644 -t "${pkgdir}/usr/share/applications" "${pkgname}.desktop"
  install -Dm644 "512x512.png" "$pkgdir/usr/share/icons/hicolor/512x512/apps/$pkgname.png"
  install -Dm644 "app.asar" "${pkgdir}/usr/lib/${pkgname}.asar"
} 

md5sums=('7bd2a1ed982baad11ae69325e73b8549'
         'f6edfa276c96b746048458413b8c26ce'
         '7ffe25882fc2b6cefd469bafaacc33f2')
