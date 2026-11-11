# Monitor de sitios IPUL

GitHub Actions ejecuta `check.mjs` cada 30 minutos. Por cada sitio de `sites.json` revisa:

1. **DNS**: que apunte solo al VPS (`2.25.191.196`) y que no tenga registros IPv6 (AAAA) extra.
2. **Contenido**: que la página cargue y muestre el texto esperado. Así se detecta si vuelve a aparecer una versión vieja.
3. **SSL**: que el certificado sea válido y que le queden al menos 14 días.

Si algo falla, la ejecución queda en rojo y **GitHub te manda un correo**. Si configuras los secretos de Telegram, también te llega un mensaje por Telegram.

## Agregar o quitar un sitio
Edita `sites.json` y sube el cambio. Si `expectIp` es `null`, no se revisa el DNS (se usa, por ejemplo, para `ipul.us`, que está en el hosting compartido de Hostinger con CDN).

## Probar a mano
- En GitHub: pestaña **Actions** → **Monitor de sitios IPUL** → **Run workflow**.
- En la PC: `node check.mjs`

## Telegram (opcional)
En **Settings → Secrets and variables → Actions** crea los secretos `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.

## Monitor en el VPS (cada 10 minutos)
GitHub retrasa las tareas programadas (en la práctica corren cada 4–8 h), así que el VPS ejecuta el mismo chequeo cada 10 minutos con cron. GitHub queda como respaldo externo, por si el VPS se apaga por completo.

En el VPS, el monitor avisa **una vez** cuando algo falla, recuerda **cada 6 horas** si el problema sigue y avisa cuando **se recupera**. Los mensajes llevan la etiqueta `[VPS]`.

- Carpeta: `/opt/ipul-monitor`. Configuración: `monitor.env`, que no se sube a GitHub. Última ejecución: `/var/log/ipul-monitor.log`.
- Para actualizar: `cd /opt/ipul-monitor && git pull`

## Notas
- GitHub desactiva las tareas programadas si el repositorio pasa **60 días sin cambios**. Te avisa por correo antes; para reactivarlas, entra en Actions y pulsa "Enable workflow", o haz cualquier cambio.
- Cuando haya un fallo, llega un correo por cada ejecución fallida (cada 30 minutos) hasta que se arregle.
