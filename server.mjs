#!/usr/bin/env node
// ============================================================
// 粟子农业 MCP Server（suzi-agri-mcp）· v0.1 「中国农业 MCP 第一人」卡位
// ------------------------------------------------------------
// 零依赖（Node >= 18，原生 fetch + stdio JSON-RPC 2.0，符合 Model Context Protocol 规范）
// 工具集（v0.1 两个，后续按 knowledge/data_sources 清单 v1.15 增量扩展）：
//   1. suzi_weather         实时气象 + 7 天预报 + NASA POWER 气候基准
//   2. suzi_weather_alerts  暴雨/高温/霜冻/大风 农事预警事件
// 数据源：Open-Meteo（免费无密钥）+ NASA POWER AG 社区（免费无密钥）
// 真源：逻辑与 agri-saas-agent/cloud-functions/_lib/weather.js 保持同构（阈值/区域表同步维护）
// 铁律：所有农艺阈值为「⚠️ 待校准推断参考值」，输出必须携带该标注，禁止当作生产农艺依据。
// 启动：node server.mjs（stdio 传输，供 Claude / 豆包 / Kimi 等 MCP 客户端接入）
// ============================================================
import { createInterface } from 'node:readline';

// ---------- 区域表（与 weather.js REGION_COORDS 同源） ----------
const REGION_COORDS = {
  '泸州':   { lat: 28.86, lon: 105.44, crop: '蔬菜/果树' },
  '龙马潭': { lat: 28.86, lon: 105.44, crop: '蔬菜/果树' },
  '合江':   { lat: 28.81, lon: 105.83, crop: '晚熟荔枝/真龙柚/蔬菜' },
  '先市':   { lat: 28.71, lon: 105.78, crop: '早熟荔枝/真龙柚' },
  '四川':   { lat: 30.57, lon: 104.07, crop: '水稻' },
  '云南':   { lat: 25.04, lon: 102.71, crop: '蔬菜/林果' },
  '广西':   { lat: 22.82, lon: 108.32, crop: '甘蔗/果蔬' },
  '海南':   { lat: 19.20, lon: 109.74, crop: '热带作物' },
  '黑龙江': { lat: 45.75, lon: 126.64, crop: '玉米/大豆' },
  '北京':   { lat: 39.90, lon: 116.40, crop: '果树/蔬菜' },
  '山东':   { lat: 36.65, lon: 117.12, crop: '果树' },
};
const WMO = {
  0: '晴', 1: '晴间多云', 2: '局部多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨', 56: '冻毛毛雨', 57: '冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '阵雨', 82: '强阵雨', 85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴小雹', 99: '雷阵雨伴大雹',
};
// ⚠️ 待校准推断阈值（与 weather.js WEATHER_ALERT_THRESHOLDS 同源）
const THRESHOLDS = { heavyRainMm: 50, frostTempC: 2, heatTempC: 35, windKmh: 62 };
const ALERT_NOTE = '⚠️ 阈值为待校准推断参考值（非实测农艺标定），仅供参考，禁止当作生产农艺依据。';

function resolveRegion(region) {
  const q = String(region || '泸州');
  for (const k of Object.keys(REGION_COORDS)) if (q.includes(k)) return { key: k, ...REGION_COORDS[k] };
  return { key: q, lat: 28.86, lon: 105.44, crop: '蔬菜/果树' };
}
const numOrNull = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));

// ---------- Open-Meteo 双源（与 weather.js 同构） ----------
async function fetchWeather(region) {
  const r = resolveRegion(region);
  const api =
    `https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max` +
    `&forecast_days=7&timezone=Asia%2FShanghai`;
  const resp = await fetch(api, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error('Open-Meteo HTTP ' + resp.status);
  return { r, j: await resp.json() };
}

async function toolWeather(args) {
  const crop = args?.crop;
  const { r, j } = await fetchWeather(args?.region);
  const cur = j.current || {};
  const lines = [];
  lines.push(`【实时气象 · ${r.key}】来源:Open-Meteo（粟子农业 MCP）`);
  lines.push(`· 当前:${cur.temperature_2m ?? '⚠️'}°C, 湿度${cur.relative_humidity_2m ?? '⚠️'}%, 风${cur.wind_speed_10m ?? '⚠️'}km/h, ${WMO[cur.weather_code] ?? '⚠️'}`);
  const fc = [];
  const d = j.daily || {};
  for (let i = 0; i < Math.min((d.time || []).length, 7); i++) {
    fc.push(`${(d.time[i] || '').slice(5)} ${WMO[d.weather_code?.[i]] ?? '⚠️'} ${d.temperature_2m_max?.[i]}/${d.temperature_2m_min?.[i]}°C 降水${d.precipitation_sum?.[i]}mm`);
  }
  lines.push('· 未来7天: ' + fc.join(' | '));
  lines.push(`· 主栽作物(推测):${crop || r.crop}`);
  let text = lines.join('\n');
  try {
    const cApi = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M&community=AG&longitude=${r.lon}&latitude=${r.lat}&format=JSON`;
    const cResp = await fetch(cApi, { signal: AbortSignal.timeout(8000) });
    if (cResp.ok) {
      const p = (await cResp.json()).properties?.parameter || {};
      const t2m = p.T2M || p.T2m || {}, pre = p.PRECTOTCORR || {};
      if (t2m.ANN != null && pre.ANN != null) {
        const annT = Math.round(Number(t2m.ANN) * 10) / 10;
        const annP = Math.round(Number(pre.ANN) * 365);
        text += `\n· 气候基准(NASA POWER 30年均值): 年均温${annT}°C, 年降水${annP}mm`;
      }
    }
  } catch { /* 气候基准失败不影响主结果 */ }
  return { content: [{ type: 'text', text }], isError: false };
}

async function toolWeatherAlerts(args) {
  const { r, j } = await fetchWeather(args?.region);
  const d = j.daily || {};
  const events = [];
  const push = (type, level, date, detail, action) =>
    events.push({ type, level, date, detail, action });
  for (let i = 0; i < (d.time || []).length; i++) {
    const date = d.time[i];
    const pr = numOrNull(d.precipitation_sum?.[i]);
    if (pr != null && pr >= THRESHOLDS.heavyRainMm)
      push('暴雨预警', pr >= THRESHOLDS.heavyRainMm * 2 ? '红色' : '橙色', date, `日降水 ${pr}mm ≥ ${THRESHOLDS.heavyRainMm}mm`, '清沟排水、推迟施肥施药；成熟果园/菜地提前抢收');
    const hi = numOrNull(d.temperature_2m_max?.[i]);
    if (hi != null && hi >= THRESHOLDS.heatTempC)
      push('高温预警', hi >= THRESHOLDS.heatTempC + 3 ? '红色' : '橙色', date, `日最高温 ${hi}°C ≥ ${THRESHOLDS.heatTempC}°C`, '早晚灌溉降温、必要时遮阳；避开正午施药');
    const lo = numOrNull(d.temperature_2m_min?.[i]);
    if (lo != null && lo <= THRESHOLDS.frostTempC)
      push('霜冻/低温预警', lo <= 0 ? '红色' : '橙色', date, `日最低温 ${lo}°C ≤ ${THRESHOLDS.frostTempC}°C`, '覆盖/熏烟/灌水保温，露地叶菜提前抢收');
    const wMax = numOrNull(d.wind_speed_10m_max?.[i]);
    if (wMax != null && wMax >= THRESHOLDS.windKmh)
      push('大风预警', '橙色', date, `日最大风速 ${wMax}km/h ≥ ${THRESHOLDS.windKmh}km/h(8级)`, '加固大棚与果树支架，停止无人机植保');
  }
  let text = events.length
    ? `【${r.key} 未来7天农事预警】共 ${events.length} 条\n` +
      events.map((e) => `· [${e.level}] ${e.date} ${e.type}：${e.detail}\n  建议:${e.action}`).join('\n')
    : `【${r.key} 未来7天】未监测到达预警阈值的气象事件（暴雨≥${THRESHOLDS.heavyRainMm}mm / 高温≥${THRESHOLDS.heatTempC}°C / 低温≤${THRESHOLDS.frostTempC}°C / 大风≥8级）。`;
  text += `\n${ALERT_NOTE}`;
  return { content: [{ type: 'text', text }], isError: false };
}

// ---------- MCP 工具清单 ----------
const TOOLS = [
  {
    name: 'suzi_weather',
    description: '获取中国农业产区实时气象+7天预报+NASA POWER 30年气候基准（免费双源，覆盖泸州/合江/龙马潭等12个预设产区，支持任意中文地名回落川南坐标）',
    inputSchema: {
      type: 'object',
      properties: {
        region: { type: 'string', description: '产区名，如：泸州/合江/龙马潭/先市/黑龙江；默认泸州' },
        crop: { type: 'string', description: '作物，如：晚熟荔枝/真龙柚/蔬菜；缺省按产区推测' },
      },
    },
  },
  {
    name: 'suzi_weather_alerts',
    description: '扫描未来7天气象并输出农事预警事件（暴雨/高温/霜冻/大风），含等级与建议动作。⚠️ 阈值为待校准推断参考值',
    inputSchema: {
      type: 'object',
      properties: { region: { type: 'string', description: '产区名，默认泸州' } },
    },
  },
];

const HANDLERS = { suzi_weather: toolWeather, suzi_weather_alerts: toolWeatherAlerts };

// ---------- 零依赖 JSON-RPC 2.0 / stdio ----------
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

const SERVER_INFO = { name: 'suzi-agri-mcp', version: '0.1.0' };

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', async (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch { return; }
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return;

  // 请求（带 id）
  if (msg.id !== undefined && msg.id !== null) {
    const reply = (result) => send({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => send({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    try {
      switch (msg.method) {
        case 'initialize':
          reply({
            protocolVersion: msg.params?.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          });
          break;
        case 'ping':
          reply({});
          break;
        case 'tools/list':
          reply({ tools: TOOLS });
          break;
        case 'tools/call': {
          const name = msg.params?.name;
          const handler = HANDLERS[name];
          if (!handler) return fail(-32602, `Unknown tool: ${name}`);
          try {
            reply(await handler(msg.params?.arguments || {}));
          } catch (e) {
            reply({ content: [{ type: 'text', text: `⚠️ 工具执行失败：${e?.message ?? e}` }], isError: true });
          }
          break;
        }
        default:
          fail(-32601, `Method not found: ${msg.method}`);
      }
    } catch (e) {
      fail(-32603, `Internal error: ${e?.message ?? e}`);
    }
  }
  // 通知（无 id）——如 notifications/initialized，静默即可
});

process.stderr.write(`[suzi-agri-mcp v0.1.0] ready on stdio · tools: ${TOOLS.map((t) => t.name).join(', ')}\n`);
