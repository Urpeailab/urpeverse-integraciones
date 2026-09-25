# Urpeverse — integraciones

Mientras trabajas con **Claude Code**, **Codex** o **Cursor**, tu avatar en [Urpeverse](https://app.urpeverse.com) muestra qué está haciendo tu agente. Con la extensión de editor, también muestra que **tú** estás codeando.

| Estado | Cuándo |
|---|---|
| 🤖 trabajando | le enviaste un prompt o está usando herramientas |
| ⏳ esperando | te pide aprobar un permiso o te hace una pregunta (Claude Code y Codex) |
| ✅ terminó | terminó su turno (se ve 2 min) |
| ⚠️ error | el turno se cortó por un error de la API |
| ⌨️ codeando | estás usando VS Code, Cursor o Windsurf (extensión) |

**Qué sale de tu máquina:** solo el estado, el nombre de la carpeta del repo y la rama. **Nunca** tu código, tus prompts, las respuestas del agente, nombres de archivos, rutas completas ni tu email.

**Si Urpeverse está caído o no hay red,** tu agente sigue igual: los hooks nunca bloquean nada.

Requisito: Node 20 o más nuevo.

## Claude Code

```
/plugin install urpeverse-estado --marketplace Urpeailab/urpeverse-integraciones
```

Después, conecta tu cuenta:

```
/urpeverse-estado:conectar
```

Con Claude Code anterior a la 2.1.275 se instala en dos pasos: `/plugin marketplace add Urpeailab/urpeverse-integraciones` y después `/plugin install urpeverse-estado@urpeverse`.

## Codex

```bash
codex plugin marketplace add Urpeailab/urpeverse-integraciones
```

En Codex: `/plugins` → **Urpeverse** → instalar, y `/hooks` para confiar en los hooks de Urpeverse (Codex lo pide una vez por hook). Después, pídele: «conecta mi cuenta de Urpeverse».

## Cursor

- **Con Cursor Teams:** el admin lo agrega una sola vez en **Dashboard → Plugins & MCPs → Import from Repo** con `https://github.com/Urpeailab/urpeverse-integraciones` y lo deja en **Default On**. Después, cada persona le pide al agente: «conecta mi cuenta de Urpeverse».
- **Sin Teams:** una línea en la terminal. Registra los hooks de Cursor y te abre el navegador para conectar:

  ```bash
  # macOS / Linux
  git clone --depth 1 https://github.com/Urpeailab/urpeverse-integraciones ~/.urpeverse/integraciones && node ~/.urpeverse/integraciones/bin/urpeverse-status.mjs instalar cursor
  ```

  ```powershell
  # Windows (PowerShell)
  git clone --depth 1 https://github.com/Urpeailab/urpeverse-integraciones "$HOME\.urpeverse\integraciones"; node "$HOME\.urpeverse\integraciones\bin\urpeverse-status.mjs" instalar cursor
  ```

  Reinicia Cursor. Solo se registran hooks de **observación**: los de permiso de Cursor bloquean la acción si reciben una respuesta inválida, y un problema de Urpeverse nunca te tiene que frenar.

## VS Code, Cursor o Windsurf — «⌨️ codeando»

Instala la extensión **Urpeverse** (`urpeailab.urpeverse-estado`): en VS Code desde el [Marketplace](https://marketplace.visualstudio.com/items?itemName=urpeailab.urpeverse-estado); en Cursor y Windsurf desde [Open VSX](https://open-vsx.org/extension/urpeailab/urpeverse-estado). Después, **Urpeverse: Conectar** en la paleta de comandos.

## Cómo es conectar

1. Se abre `app.urpeverse.com/conectar` con un código de 8 letras.
2. Compruebas que el código es el mismo que te muestra tu herramienta y tocas **Autorizar**.
3. Listo. El token se crea solo: nunca lo copias ni lo pegas.

Cada conexión aparece en **Urpeverse → Configuración → Integraciones** con el nombre de la herramienta y del sistema (por ejemplo, «Claude Code · Windows») y se revoca desde ahí. Es el mismo flujo que usan `gh auth login` o Codex: la autorización de dispositivos de OAuth ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)).

Una conexión por máquina alcanza para Claude Code, Codex y Cursor: comparten `~/.urpeverse/credenciales.json`, que solo tu usuario puede leer. La extensión guarda la suya en el llavero del editor.

## Para equipos

- **Repo del equipo con Claude Code:** suma esto al `.claude/settings.json` del repo. Claude Code se lo ofrece a cada persona la primera vez que confía en la carpeta.

  ```json
  {
    "extraKnownMarketplaces": {
      "urpeverse": { "source": { "source": "github", "repo": "Urpeailab/urpeverse-integraciones" } }
    },
    "enabledPlugins": { "urpeverse-estado@urpeverse": true }
  }
  ```

- **Claude Team o Enterprise:** las mismas dos claves en los [managed settings](https://code.claude.com/docs/en/plugins/org) lo instalan en todas las máquinas de la organización.
- **Cursor Teams:** el marketplace del equipo (ver arriba).

## Diagnóstico

`node <carpeta del plugin>/bin/urpeverse-status.mjs diagnostico` dice con qué cuenta está conectada la máquina, y `desconectar` revoca el token y lo borra de la máquina. También puedes revocarlo desde Integraciones.

## Licencia

[MIT](LICENSE). Este repo se genera desde el código de Urpeverse: no edites los archivos a mano.
