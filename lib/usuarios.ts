// Reglas de usuarios (módulo Usuarios, solo admin).
export const USERNAME_RE  = /^[a-z0-9._-]{3,30}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72   // bcrypt ignora lo que pasa de 72 bytes
