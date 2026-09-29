---
name: conectar
description: Conecta Claude Code con la cuenta de Urpeverse de la persona para que su avatar muestre lo que hace el agente. Úsalo solo cuando la persona pida conectar, vincular o configurar Urpeverse.
argument-hint: "[--forzar]"
allowed-tools: Bash(node "${CLAUDE_PLUGIN_ROOT}/bin/urpeverse-status.mjs" conectar *)
---

# Conectar Urpeverse

La persona autoriza en su navegador. Nunca le pidas un token ni lo muestres.

1. Ejecuta:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/urpeverse-status.mjs" conectar --fuente claude_code --sin-esperar $ARGUMENTS
   ```

   - Si dice que esta máquina ya está conectada, díselo y termina. Para usar otra cuenta se ejecuta de nuevo con `--forzar`.
   - Si falla, cuéntale el error en una línea y termina.

2. Muéstrale el link y el código de confirmación tal como se imprimieron. Dile que toque «Autorizar» en esa página, que ya se abrió en su navegador.

3. Espera a que autorice. Puede tardar unos minutos: usa un timeout de 10 minutos.

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/urpeverse-status.mjs" conectar --esperar
   ```

4. Cuéntale el resultado en una línea, en su idioma.
