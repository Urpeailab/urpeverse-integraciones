---
name: conectar
description: Conecta Codex con la cuenta de Urpeverse de la persona para que su avatar muestre lo que hace el agente. Úsalo solo cuando la persona pida conectar, vincular o configurar Urpeverse.
---

# Conectar Urpeverse

La persona autoriza en su navegador. Nunca le pidas un token ni lo muestres.

El CLI de Urpeverse viene en este plugin: es `../../bin/urpeverse-status.mjs`, relativo a la carpeta de este archivo. Usa su ruta absoluta. Necesita red para hablar con Urpeverse: si el sandbox la bloquea, pide permiso para ejecutarlo.

1. Ejecuta `node "<ruta del CLI>" conectar --fuente codex --sin-esperar`.
   - Si dice que esta máquina ya está conectada, díselo y termina. Para usar otra cuenta se ejecuta de nuevo con `--forzar`.
   - Si falla, cuéntale el error en una línea y termina.

2. Muéstrale el link y el código de confirmación tal como se imprimieron. Dile que toque «Autorizar» en esa página, que ya se abrió en su navegador.

3. Espera a que autorice con `node "<ruta del CLI>" conectar --esperar`. Puede tardar unos minutos: dale hasta 10 minutos.

4. Cuéntale el resultado en una línea, en su idioma.
