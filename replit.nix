{ pkgs }: {
  deps = [
    pkgs.nix-update
    pkgs.nodejs_20
    pkgs.postgresql_16
    pkgs.chromium
    # Librerías esenciales para Puppeteer/Chromium en Deployments
    pkgs.glib
    pkgs.nss
    pkgs.fontconfig
    pkgs.cairo
    pkgs.pango
    pkgs.expat
    pkgs.dbus
    pkgs.nspr
    pkgs.atk
    pkgs.mesa
    pkgs.libdrm
    pkgs.xorg.libX11
    pkgs.xorg.libxcb
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxshmfence
  ];
}