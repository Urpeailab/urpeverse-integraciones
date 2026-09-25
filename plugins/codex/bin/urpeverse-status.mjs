#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync, chmodSync, readFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
const TOKEN_PERSONAL_REGEX = /^urpe_ut_[A-Za-z0-9_-]{43}$/;
const CLIENTES_CONEXION = ["claude_code", "codex", "cursor", "vscode", "windsurf"];
function esClienteConexion(valor) {
  return CLIENTES_CONEXION.includes(valor);
}
function sistemaDesdePlataforma(plataforma) {
  if (plataforma === "win32") return "windows";
  if (plataforma === "darwin") return "macos";
  if (plataforma === "linux") return "linux";
  return "otro";
}
const CODIGO_USUARIO_REGEX = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
const CODIGO_DISPOSITIVO_REGEX = /^[A-Za-z0-9_-]{43}$/;
const VIDA_CONEXION_S = 600;
const INTERVALO_SONDEO_S = 5;
const AUMENTO_SLOW_DOWN_S = 5;
const APP_URL_PRODUCCION = "https://app.urpeverse.com";
const RUTA_CONECTAR = "/conectar";
function urlVerificacion(appUrl, codigo) {
  return `${appUrl.replace(/\/+$/, "")}${RUTA_CONECTAR}?codigo=${encodeURIComponent(codigo)}`;
}
const esObjeto$2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const enteroPositivo = (v) => typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
const textoOpcional = (v) => typeof v === "string" && v.trim() !== "" ? v.trim() : null;
function interpretarRespuestaInicio(status, cuerpo) {
  if (status === null || status >= 500) return { tipo: "sin_conexion" };
  if (status === 429) return { tipo: "limitada" };
  if (status !== 200 || !esObjeto$2(cuerpo)) return { tipo: "error" };
  const { device_code: dispositivo, user_code: usuario } = cuerpo;
  if (typeof dispositivo !== "string" || !CODIGO_DISPOSITIVO_REGEX.test(dispositivo)) return { tipo: "error" };
  if (typeof usuario !== "string" || !CODIGO_USUARIO_REGEX.test(usuario)) return { tipo: "error" };
  return {
    tipo: "ok",
    inicio: {
      codigoDispositivo: dispositivo,
      codigoUsuario: usuario,
      expiraEnS: enteroPositivo(cuerpo.expires_in) ?? VIDA_CONEXION_S,
      intervaloS: enteroPositivo(cuerpo.interval) ?? INTERVALO_SONDEO_S
    }
  };
}
const ERRORES_CANJE = {
  authorization_pending: { tipo: "pendiente" },
  slow_down: { tipo: "lento" },
  access_denied: { tipo: "rechazada" },
  expired_token: { tipo: "vencida" }
};
function interpretarRespuestaCanje(status, cuerpo) {
  if (status === null || status >= 500) return { tipo: "sin_conexion" };
  if (status === 429) return { tipo: "lento" };
  if (!esObjeto$2(cuerpo)) return { tipo: "error" };
  if (status === 200) {
    const token = cuerpo.access_token;
    if (typeof token !== "string" || !TOKEN_PERSONAL_REGEX.test(token)) return { tipo: "error" };
    return { tipo: "token", token, persona: textoOpcional(cuerpo.persona), espacio: textoOpcional(cuerpo.espacio) };
  }
  if (status === 400 && typeof cuerpo.error === "string") return ERRORES_CANJE[cuerpo.error] ?? { tipo: "error" };
  return { tipo: "error" };
}
function esResultadoFinal(resultado) {
  return resultado.tipo === "token" || resultado.tipo === "rechazada" || resultado.tipo === "vencida" || resultado.tipo === "error";
}
function siguienteIntervaloS(actualS, resultado) {
  return resultado.tipo === "lento" ? actualS + AUMENTO_SLOW_DOWN_S : actualS;
}
const ENDPOINT_ESTADO_DEV = "https://lcryrsdyrzotjqdxcwtp.supabase.co/functions/v1/estado-dev";
const DETALLE_MAX_LEN = 300;
async function enviarEventoEstado(endpoint, token, cuerpo, timeoutMs) {
  try {
    const respuesta = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (respuesta.ok) return { status: respuesta.status, detalle: null };
    return { status: respuesta.status, detalle: await detalleProblema(respuesta) };
  } catch {
    return { status: null, detalle: null };
  }
}
async function detalleProblema(respuesta) {
  try {
    const cuerpo = await respuesta.json();
    const texto = typeof cuerpo.detail === "string" ? cuerpo.detail : typeof cuerpo.title === "string" ? cuerpo.title : null;
    return texto === null ? null : texto.slice(0, DETALLE_MAX_LEN);
  } catch {
    return null;
  }
}
const DIR_URPEVERSE = join(homedir(), ".urpeverse");
const ARCHIVO_CREDENCIALES = join(DIR_URPEVERSE, "credenciales.json");
const ARCHIVO_PENDIENTE = join(DIR_URPEVERSE, "conexion-pendiente.json");
const DIR_SESIONES = join(DIR_URPEVERSE, "sesiones");
function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return null;
  }
}
function escribirJson(ruta, valor, privado = false) {
  writeFileSync(ruta, `${JSON.stringify(valor, null, 2)}
`, { encoding: "utf8", mode: privado ? 384 : 420 });
  if (privado) chmodSync(ruta, 384);
}
function leerConexion() {
  const v = leerJson(ARCHIVO_CREDENCIALES);
  return v !== null && typeof v.token === "string" ? v : null;
}
function resolverCredenciales(env) {
  const conexion = leerConexion();
  const deEntorno = env.URPEVERSE_TOKEN?.trim() || null;
  const token = deEntorno ?? conexion?.token ?? null;
  const endpoint = env.URPEVERSE_ENDPOINT?.trim() || conexion?.endpoint || ENDPOINT_ESTADO_DEV;
  return { token, endpoint, origen: deEntorno !== null ? "entorno" : token !== null ? "archivo" : null, conexion };
}
function resolverAppUrl(env, deArgumento) {
  return deArgumento?.trim() || env.URPEVERSE_APP_URL?.trim() || APP_URL_PRODUCCION;
}
function guardarConexion(conexion) {
  mkdirSync(DIR_URPEVERSE, { recursive: true });
  escribirJson(ARCHIVO_CREDENCIALES, conexion, true);
  return ARCHIVO_CREDENCIALES;
}
function borrarConexion() {
  rmSync(ARCHIVO_CREDENCIALES, { force: true });
}
function leerConexionPendiente() {
  const v = leerJson(ARCHIVO_PENDIENTE);
  if (v === null || typeof v.codigoDispositivo !== "string" || !CODIGO_DISPOSITIVO_REGEX.test(v.codigoDispositivo)) return null;
  if (typeof v.codigoUsuario !== "string" || typeof v.url !== "string" || !esClienteConexion(v.cliente)) return null;
  if (typeof v.expiraEnMs !== "number" || typeof v.intervaloS !== "number" || typeof v.proximoSondeoMs !== "number") return null;
  return v;
}
function guardarConexionPendiente(pendiente) {
  mkdirSync(DIR_URPEVERSE, { recursive: true });
  escribirJson(ARCHIVO_PENDIENTE, pendiente, true);
}
function borrarConexionPendiente() {
  rmSync(ARCHIVO_PENDIENTE, { force: true });
}
function tokenValido(token) {
  return TOKEN_PERSONAL_REGEX.test(token);
}
const rutaSesion = (sesionId) => join(DIR_SESIONES, `${sesionId.replace(/:/g, "_")}.json`);
function leerUltimoEnvio(sesionId) {
  const v = leerJson(rutaSesion(sesionId));
  return v !== null && typeof v.tipo === "string" && typeof v.enviadoEnMs === "number" ? v : null;
}
function guardarUltimoEnvio(sesionId, envio) {
  mkdirSync(DIR_SESIONES, { recursive: true });
  escribirJson(rutaSesion(sesionId), envio);
}
const MARCA_COMANDO = "urpeverse-status";
const EVENTOS_CURSOR$1 = [
  "afterAgentThought",
  "afterFileEdit",
  "afterShellExecution",
  "afterMCPExecution",
  "stop",
  "sessionEnd"
];
function construirComandoHook(rutaNode, rutaCli, fuente) {
  return `"${rutaNode}" "${rutaCli}" hook --fuente ${fuente}`;
}
const esObjeto$1 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const esNuestro = (comando) => typeof comando === "string" && comando.includes(MARCA_COMANDO);
function fusionarHooksCursor(actual, comando) {
  const base = esObjeto$1(actual) ? { ...actual } : {};
  const hooks = esObjeto$1(base.hooks) ? { ...base.hooks } : {};
  for (const evento of EVENTOS_CURSOR$1) {
    const previas = Array.isArray(hooks[evento]) ? hooks[evento] : [];
    const ajenas = previas.filter((h) => !(esObjeto$1(h) && esNuestro(h.command)));
    hooks[evento] = [...ajenas, { command: comando }];
  }
  return { ...base, version: 1, hooks };
}
function endpointConectar(endpointEstadoDev) {
  return endpointEstadoDev.replace(/\/estado-dev\/?$/, "/conectar-dispositivo");
}
async function postJson(endpoint, cuerpo, timeoutMs, token) {
  try {
    const respuesta = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...token === void 0 ? {} : { Authorization: `Bearer ${token}` } },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const texto = await respuesta.text();
    let json = null;
    try {
      json = texto === "" ? null : JSON.parse(texto);
    } catch {
      json = null;
    }
    return { status: respuesta.status, json };
  } catch {
    return { status: null, json: null };
  }
}
async function iniciarConexion(endpoint, cliente, sistema, timeoutMs) {
  const { status, json } = await postJson(endpoint, { accion: "iniciar", cliente, sistema }, timeoutMs);
  return interpretarRespuestaInicio(status, json);
}
async function canjearConexion(endpoint, codigoDispositivo, timeoutMs) {
  const { status, json } = await postJson(endpoint, { accion: "canjear", device_code: codigoDispositivo }, timeoutMs);
  return interpretarRespuestaCanje(status, json);
}
async function revocarConexion(endpoint, token, timeoutMs) {
  const { status } = await postJson(endpoint, { accion: "revocar" }, timeoutMs, token);
  return status === 204;
}
async function esperarAutorizacion(deps, opciones) {
  let intervaloS = opciones.intervaloS;
  for (; ; ) {
    if (deps.cancelado?.()) return { tipo: "cancelada" };
    if (deps.ahora() + intervaloS * 1e3 > opciones.hastaMs) return { tipo: "agotada" };
    await deps.esperar(intervaloS * 1e3);
    if (deps.cancelado?.()) return { tipo: "cancelada" };
    const resultado = await deps.canjear();
    if (esResultadoFinal(resultado)) return resultado;
    intervaloS = siguienteIntervaloS(intervaloS, resultado);
    deps.alSondear?.(resultado, intervaloS);
  }
}
const URL_ABRIBLE_REGEX = /^https?:\/\/[A-Za-z0-9._~:/?#@+=-]+$/;
function hayEscritorio(env, plataforma) {
  if (env.SSH_CONNECTION || env.SSH_TTY) return false;
  if (plataforma === "linux") return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
  return true;
}
function abrirNavegador(url, env = process.env, plataforma = process.platform) {
  if (!URL_ABRIBLE_REGEX.test(url) || !hayEscritorio(env, plataforma)) return false;
  const [comando, argumentos] = plataforma === "win32" ? ["cmd", ["/c", "start", '""', url]] : plataforma === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const hijo = spawn(comando, argumentos, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: plataforma === "win32"
    });
    hijo.on("error", () => void 0);
    hijo.unref();
    return true;
  } catch {
    return false;
  }
}
const TIMEOUT_MS = 8e3;
const ESPERA_MAX_MS = 9 * 6e4;
const MARGEN_REUSO_MS = 6e4;
const hora = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
async function pedirConexion(op, endpoint) {
  const r = await iniciarConexion(endpointConectar(endpoint), op.cliente, sistemaDesdePlataforma(process.platform), TIMEOUT_MS);
  if (r.tipo !== "ok") {
    console.error(
      r.tipo === "limitada" ? "Urpeverse recibió muchas conexiones seguidas. Prueba de nuevo en un minuto." : "No se pudo contactar a Urpeverse. Revisa tu conexión y prueba de nuevo."
    );
    return null;
  }
  const ahora = Date.now();
  const pendiente = {
    codigoDispositivo: r.inicio.codigoDispositivo,
    codigoUsuario: r.inicio.codigoUsuario,
    url: urlVerificacion(op.appUrl, r.inicio.codigoUsuario),
    cliente: op.cliente,
    expiraEnMs: ahora + r.inicio.expiraEnS * 1e3,
    intervaloS: r.inicio.intervaloS,
    proximoSondeoMs: ahora + r.inicio.intervaloS * 1e3
  };
  guardarConexionPendiente(pendiente);
  return pendiente;
}
function imprimirInstrucciones(p, abierto) {
  console.log("Para conectar tu cuenta de Urpeverse, abre este link y toca «Autorizar»:");
  console.log("");
  console.log(`  ${p.url}`);
  console.log("");
  console.log(`Código de confirmación: ${p.codigoUsuario} (vence a las ${hora(p.expiraEnMs)})`);
  console.log(abierto ? "Ya se abrió en tu navegador." : "Ábrelo en tu navegador; también sirve otro dispositivo.");
}
async function modoConectar(op) {
  const cred = resolverCredenciales(process.env);
  if (op.espera !== "solo_esperar") {
    if (cred.token !== null && !op.forzar) {
      const quien = cred.conexion?.persona ? ` como ${cred.conexion.persona}` : "";
      console.log(`Esta máquina ya está conectada${quien}. Para usar otra cuenta: urpeverse-status conectar --forzar`);
      return 0;
    }
    const guardada = leerConexionPendiente();
    const vigente = guardada !== null && guardada.expiraEnMs - Date.now() > MARGEN_REUSO_MS ? guardada : null;
    const pendiente = vigente ?? await pedirConexion(op, cred.endpoint);
    if (pendiente === null) return 1;
    imprimirInstrucciones(pendiente, op.abrir && abrirNavegador(pendiente.url));
    if (op.espera === "sin_esperar") return 0;
  }
  return esperar(cred);
}
async function esperar(cred) {
  const pendiente = leerConexionPendiente();
  if (pendiente === null) {
    console.error("No hay ninguna conexión esperando. Ejecuta: urpeverse-status conectar");
    return 1;
  }
  const endpoint = endpointConectar(cred.endpoint);
  let actual = pendiente;
  const fin = await esperarAutorizacion(
    {
      canjear: () => canjearConexion(endpoint, pendiente.codigoDispositivo, TIMEOUT_MS),
      esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ahora: () => Date.now(),
      alSondear: (_resultado, intervaloS) => {
        actual = { ...actual, intervaloS, proximoSondeoMs: Date.now() + intervaloS * 1e3 };
        guardarConexionPendiente(actual);
      }
    },
    { intervaloS: pendiente.intervaloS, hastaMs: Math.min(pendiente.expiraEnMs, Date.now() + ESPERA_MAX_MS) }
  );
  return terminar(fin, actual, cred);
}
async function terminar(fin, pendiente, cred) {
  if (fin.tipo === "agotada" || fin.tipo === "cancelada") {
    console.log(`Todavía no autorizaste. Cuando lo hagas, se conecta sola con el próximo evento de tu agente (el código vence a las ${hora(pendiente.expiraEnMs)}).`);
    return 0;
  }
  borrarConexionPendiente();
  if (fin.tipo !== "token") {
    console.error(mensajeFallo(fin));
    return 1;
  }
  await guardarNuevaConexion(fin, pendiente.cliente, cred);
  const donde = fin.espacio ? ` en ${fin.espacio}` : "";
  console.log(`✓ Conectado${fin.persona ? ` como ${fin.persona}` : ""}${donde}. Tu avatar ya muestra lo que hace tu agente.`);
  return 0;
}
function mensajeFallo(fin) {
  if (fin.tipo === "rechazada") return "✗ La conexión se canceló en Urpeverse.";
  if (fin.tipo === "vencida") return "✗ El código venció. Ejecuta urpeverse-status conectar de nuevo.";
  return "✗ Urpeverse no aceptó la conexión. Ejecuta urpeverse-status conectar de nuevo.";
}
async function guardarNuevaConexion(fin, cliente, cred) {
  const anterior = cred.origen === "archivo" ? cred.token : null;
  guardarConexion({
    token: fin.token,
    persona: fin.persona,
    espacio: fin.espacio,
    cliente,
    conectadoEnMs: Date.now(),
    ...cred.conexion?.endpoint ? { endpoint: cred.conexion.endpoint } : {}
  });
  if (anterior !== null && anterior !== fin.token) await revocarConexion(endpointConectar(cred.endpoint), anterior, TIMEOUT_MS);
}
async function completarConexionPendiente(endpointEstadoDev, timeoutMs) {
  const pendiente = leerConexionPendiente();
  const ahora = Date.now();
  if (pendiente === null || ahora < pendiente.proximoSondeoMs) return null;
  if (ahora >= pendiente.expiraEnMs) {
    borrarConexionPendiente();
    return null;
  }
  const r = await canjearConexion(endpointConectar(endpointEstadoDev), pendiente.codigoDispositivo, timeoutMs);
  if (r.tipo === "token") {
    guardarConexion({ token: r.token, persona: r.persona, espacio: r.espacio, cliente: pendiente.cliente, conectadoEnMs: ahora });
    borrarConexionPendiente();
    return r.token;
  }
  if (esResultadoFinal(r)) {
    borrarConexionPendiente();
    return null;
  }
  const intervaloS = siguienteIntervaloS(pendiente.intervaloS, r);
  guardarConexionPendiente({ ...pendiente, intervaloS, proximoSondeoMs: ahora + intervaloS * 1e3 });
  return null;
}
async function modoDesconectar() {
  const cred = resolverCredenciales(process.env);
  borrarConexionPendiente();
  if (cred.origen === "entorno") {
    console.error("El token viene de la variable URPEVERSE_TOKEN: quítala de tu entorno.");
    return 1;
  }
  if (cred.token === null) {
    console.log("Esta máquina no estaba conectada.");
    return 0;
  }
  const revocado = await revocarConexion(endpointConectar(cred.endpoint), cred.token, TIMEOUT_MS);
  borrarConexion();
  console.log(
    revocado ? "✓ Desconectado: el token quedó revocado en Urpeverse y se borró de esta máquina." : "Se borró de esta máquina, pero no se pudo revocar en Urpeverse. Revócalo en Configuración → Integraciones."
  );
  return 0;
}
const FUENTES_IDE = ["claude_code", "cursor", "codex"];
const ACTIVIDAD_REPO_MAX_LEN = 100;
const ACTIVIDAD_RAMA_MAX_LEN = 120;
const ACTIVIDAD_SESION_ID_MAX_LEN = 128;
const TRABAJANDO = "trabajando";
const EVENTOS_ESTILO_CLAUDE = {
  UserPromptSubmit: TRABAJANDO,
  PreToolUse: TRABAJANDO,
  PostToolUse: TRABAJANDO,
  PostToolUseFailure: TRABAJANDO,
  SubagentStart: TRABAJANDO,
  PermissionRequest: "esperando",
  Stop: "terminado",
  StopFailure: "error",
  Interrupt: "terminado",
  SessionEnd: "fin"
};
const NOTIFICACIONES_ESPERANDO = /* @__PURE__ */ new Set([
  "permission_prompt",
  "elicitation_dialog",
  "elicitation_url_dialog",
  "agent_needs_input"
]);
const EVENTOS_CURSOR = {
  beforeSubmitPrompt: TRABAJANDO,
  preToolUse: TRABAJANDO,
  postToolUse: TRABAJANDO,
  postToolUseFailure: TRABAJANDO,
  subagentStart: TRABAJANDO,
  beforeShellExecution: TRABAJANDO,
  afterShellExecution: TRABAJANDO,
  beforeMCPExecution: TRABAJANDO,
  afterMCPExecution: TRABAJANDO,
  afterFileEdit: TRABAJANDO,
  afterAgentThought: TRABAJANDO,
  sessionEnd: "fin"
};
function normalizarEventoIde(fuenteDeclarada, payload) {
  if (!esObjeto(payload)) return null;
  const fuente = typeof payload.cursor_version === "string" ? "cursor" : fuenteDeclarada;
  const tipo = resolverTipo(fuente, payload);
  if (tipo === null) return null;
  const sesionId = sanearSesionId(
    payload.session_id ?? payload.conversation_id ?? payload["thread-id"]
  );
  if (sesionId === null) return null;
  return { fuente, sesionId, tipo, repo: nombreRepoDesdeDirectorio(extraerDirectorioTrabajo(payload)) };
}
function resolverTipo(fuente, payload) {
  if (fuente === "codex" && payload.type === "agent-turn-complete") return "terminado";
  const evento = payload.hook_event_name;
  if (typeof evento !== "string") return null;
  if (fuente === "cursor") {
    if (evento === "stop") return payload.status === "error" ? "error" : "terminado";
    return EVENTOS_CURSOR[evento] ?? null;
  }
  if (evento === "Notification") {
    return NOTIFICACIONES_ESPERANDO.has(String(payload.notification_type)) ? "esperando" : null;
  }
  return EVENTOS_ESTILO_CLAUDE[evento] ?? null;
}
function extraerDirectorioTrabajo(payload) {
  if (!esObjeto(payload)) return null;
  if (typeof payload.cwd === "string" && payload.cwd.trim() !== "") return payload.cwd;
  const raices = payload.workspace_roots;
  if (Array.isArray(raices) && typeof raices[0] === "string" && raices[0].trim() !== "") {
    return raices[0];
  }
  return null;
}
function nombreRepoDesdeDirectorio(directorio) {
  if (directorio === null) return null;
  const partes = directorio.split(/[\\/]+/).filter((p) => p.trim() !== "");
  const ultima = partes[partes.length - 1];
  if (ultima === void 0 || /^[a-z]:$/i.test(ultima)) return null;
  return ultima.trim().slice(0, ACTIVIDAD_REPO_MAX_LEN);
}
function sanearSesionId(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, ACTIVIDAD_SESION_ID_MAX_LEN);
  return limpio === "" ? null : limpio;
}
function esObjeto(valor) {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
const REENVIO_MISMO_ESTADO_MS = 6e4;
function debeEnviarEventoIde(ultimo, tipo, ahoraMs) {
  if (ultimo === null || ultimo.tipo !== tipo) return true;
  return ahoraMs - ultimo.enviadoEnMs >= REENVIO_MISMO_ESTADO_MS;
}
function ramaVisible(rama) {
  const limpia = rama?.trim() ?? "";
  return limpia === "" || limpia === "HEAD" ? null : limpia.slice(0, ACTIVIDAD_RAMA_MAX_LEN);
}
function interpretarRespuestaEstadoDev(status) {
  if (status === null) return "sin_conexion";
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "token_invalido";
  if (status === 429) return "limitado";
  if (status >= 400 && status < 500) return "rechazado";
  return "sin_conexion";
}
function construirCuerpoEventoEstado(evento, rama) {
  return {
    fuente: evento.fuente,
    sesionId: evento.sesionId,
    tipo: evento.tipo,
    repo: evento.repo,
    rama: ramaVisible(rama)
  };
}
const TIMEOUT_POST_MS = 2e3;
const TIMEOUT_STDIN_MS = 1500;
const TIMEOUT_GIT_MS = 800;
async function leerStdin() {
  if (process.stdin.isTTY) return "";
  return new Promise((resolve) => {
    let datos = "";
    const corte = setTimeout(() => resolve(datos), TIMEOUT_STDIN_MS);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => datos += c);
    process.stdin.on("end", () => {
      clearTimeout(corte);
      resolve(datos);
    });
  });
}
function leerRama(directorio) {
  if (directorio === null) return null;
  try {
    return execFileSync("git", ["-C", directorio, "rev-parse", "--abbrev-ref", "HEAD"], {
      timeout: TIMEOUT_GIT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();
  } catch {
    return null;
  }
}
async function modoHook(fuenteArg, ultimoArg) {
  const fuente = fuenteArg;
  if (fuente === void 0 || !FUENTES_IDE.includes(fuente)) return;
  const crudo = ultimoArg.trimStart().startsWith("{") ? ultimoArg : await leerStdin();
  let payload;
  try {
    payload = JSON.parse(crudo);
  } catch {
    return;
  }
  const evento = normalizarEventoIde(fuente, payload);
  if (evento === null) return;
  const ahora = Date.now();
  if (!debeEnviarEventoIde(leerUltimoEnvio(evento.sesionId), evento.tipo, ahora)) return;
  const credenciales = resolverCredenciales(process.env);
  const token = credenciales.token ?? await completarConexionPendiente(credenciales.endpoint, TIMEOUT_POST_MS);
  if (token === null) return;
  const cuerpo = construirCuerpoEventoEstado(evento, leerRama(extraerDirectorioTrabajo(payload)));
  const { status } = await enviarEventoEstado(credenciales.endpoint, token, cuerpo, TIMEOUT_POST_MS);
  if (interpretarRespuestaEstadoDev(status) === "ok") {
    guardarUltimoEnvio(evento.sesionId, { tipo: evento.tipo, enviadoEnMs: ahora });
  }
}
const REPO_PUBLICO = "https://github.com/Urpeailab/urpeverse-integraciones";
function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : void 0;
}
const bandera = (nombre) => process.argv.includes(`--${nombre}`);
function opcionesConectar(clientePorDefecto) {
  const fuente = argumento("fuente");
  const espera = bandera("sin-esperar") ? "sin_esperar" : bandera("esperar") ? "solo_esperar" : "completo";
  return {
    cliente: esClienteConexion(fuente) ? fuente : clientePorDefecto,
    espera,
    abrir: !bandera("no-abrir"),
    forzar: bandera("forzar"),
    appUrl: resolverAppUrl(process.env, argumento("app-url"))
  };
}
function modoConfigurar() {
  const token = argumento("token") ?? "";
  if (!tokenValido(token)) {
    console.error("Token inválido: empieza con urpe_ut_. Lo más simple es no copiar nada: urpeverse-status conectar");
    return 1;
  }
  const endpoint = argumento("endpoint");
  const ruta = guardarConexion({ token, cliente: null, conectadoEnMs: Date.now(), ...endpoint ? { endpoint } : {} });
  console.log(`Guardado en ${ruta} (solo lectura para tu usuario).`);
  return 0;
}
async function modoInstalar(herramienta) {
  if (herramienta !== "cursor") {
    console.error(`Uso: urpeverse-status instalar cursor. Claude Code y Codex se instalan como plugin: ${REPO_PUBLICO}`);
    return 1;
  }
  const destinoBin = join(DIR_URPEVERSE, "bin", "urpeverse-status.mjs");
  mkdirSync(dirname(destinoBin), { recursive: true });
  copyFileSync(fileURLToPath(import.meta.url), destinoBin);
  const dirCursor = join(homedir(), ".cursor");
  const archivo = join(dirCursor, "hooks.json");
  mkdirSync(dirCursor, { recursive: true });
  escribirJson(archivo, fusionarHooksCursor(leerJson(archivo), construirComandoHook(process.execPath, destinoBin, "cursor")));
  console.log(`Hooks de Cursor registrados en ${archivo}. Reinicia Cursor para que los tome.`);
  if (resolverCredenciales(process.env).token !== null) return 0;
  console.log("");
  return modoConectar(opcionesConectar("cursor"));
}
function modoDiagnostico() {
  const { token, endpoint, origen, conexion } = resolverCredenciales(process.env);
  console.log(`endpoint: ${endpoint}`);
  if (token === null) console.log("conexión: esta máquina NO está conectada (urpeverse-status conectar)");
  else {
    const de = origen === "entorno" ? "URPEVERSE_TOKEN" : "~/.urpeverse/credenciales.json";
    console.log(`token: ${token.slice(0, 12)}… (${tokenValido(token) ? "formato ok" : "formato inválido"}, de ${de})`);
    if (conexion?.persona) console.log(`cuenta: ${conexion.persona}${conexion.espacio ? ` en ${conexion.espacio}` : ""}`);
  }
  const pendiente = leerConexionPendiente();
  if (pendiente !== null) console.log(`esperando autorización: ${pendiente.codigoUsuario} → ${pendiente.url}`);
  return 0;
}
async function main() {
  const [comando] = process.argv.slice(2);
  if (comando === "hook") {
    try {
      await modoHook(argumento("fuente"), process.argv[process.argv.length - 1] ?? "");
    } catch {
    }
    process.exit(0);
  }
  if (comando === "conectar") process.exitCode = await modoConectar(opcionesConectar("claude_code"));
  else if (comando === "desconectar") process.exitCode = await modoDesconectar();
  else if (comando === "diagnostico") process.exitCode = modoDiagnostico();
  else if (comando === "instalar") process.exitCode = await modoInstalar(process.argv[3]);
  else if (comando === "configurar") process.exitCode = modoConfigurar();
  else console.log(`Uso: urpeverse-status conectar|desconectar|diagnostico|instalar cursor — ver ${REPO_PUBLICO}`);
}
void main();
