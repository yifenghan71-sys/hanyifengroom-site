/* ========================================================================================
 * HanYIF 学习室 —— Cloudflare Pages Functions 反向代理
 * ----------------------------------------------------------------------------------------
 * 作用：让同学们打开 hanyifengroom.pages.dev 时，浏览器对 Supabase 的所有请求
 *       （倒计时 REST API + 直播间 Realtime 的 WebSocket）都走当前网页的同域路径：
 *
 *         /sb/rest/v1/...         → https://<项目>.supabase.co/rest/v1/...
 *         /sb/realtime/v1/...     → wss://<项目>.supabase.co/realtime/v1/...
 *
 *       浏览器全程只和 pages.dev（或以后绑定的自定义域名）通信，不直连 supabase.co，
 *       因此不需要任何代理。密钥仍由前端请求头携带，本函数只做透明转发，不接触数据。
 *
 * 费用：Pages Functions 计入 Workers 免费额度（10 万次请求/天）；
 *       WebSocket 建连算 1 次请求，之后长连接内消息不重复计数，自习室规模完全够用。
 *
 * 注意：本文件必须随项目部署才生效。Pages「网页拖拽上传」方式不会编译 functions 目录，
 *       请使用 Git 连接自动部署，或用 wrangler 命令：wrangler pages deploy .
 * ======================================================================================== */

/* 你的 Supabase 项目主机名（不带 https://，也不带 /sb 前缀） */
const SUPABASE_HOST = 'bngpewvzgzhcgwdesrce.supabase.co';

/* 只放行 Supabase 实际提供的服务前缀，避免这个函数被当成任意网站的开放代理 */
const ALLOWED_PREFIXES = ['rest/', 'auth/', 'realtime/', 'storage/', 'functions/'];

export async function onRequest(context) {
  const { request, params } = context;

  /* catch-all 路由 [[path]] 捕获到的是路径段数组，如 ['rest','v1','countdowns'] */
  const segs = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const path = segs.join('/');

  if (!ALLOWED_PREFIXES.some(p => path.startsWith(p))) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const targetUrl = `https://${SUPABASE_HOST}/${path}${url.search}`;

  /* 用原始请求构造上游请求：method、请求头（含 apikey / authorization）、请求体全部保留。
     Worker 运行时会自动重写 Host 等禁止修改的头，无需手工处理。 */
  const upstream = new Request(targetUrl, request);

  /* WebSocket 升级请求（Realtime）：fetch 上游返回的 101 响应中携带双向 socket，
     直接原样返回即完成透明透传，Supabase 客户端无感知。 */
  const resp = await fetch(upstream, {
    /* 不做边缘缓存：REST 响应本身带 no-store，这里显式声明双保险 */
    cf: { cacheTtl: 0, cacheEverything: false }
  });

  return resp;
}
