{ pkgs }: {
  deps = [
    pkgs.nix-update
    pkgs.nodejs_20      # CORREGIDO: Guion bajo obligatoro
    pkgs.postgresql_16
    pkgs.chromium       # El navegador real del sistema
    pkgs.glib           # Dependencias necesarias
    pkgs.nss
    pkgs.fontconfig
  ];
}