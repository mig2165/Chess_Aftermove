// Multi-theme piece rendering:
// 1. "modern" (Staunton / Neo vector set - sharp tournament style)
// 2. "classic" (Original Unicode glyphs with typography)
// 3. "minimal" (Modern minimalist geometric silhouettes)
// 4. "woodcraft" (Handcrafted traditional tournament aesthetic with deep accents)
// 5. "glass" (Cyberpunk/Neon luminescent styling)

function wrapSvg(inner, cls = "chess-piece-svg") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="100%" height="100%" class="${cls}">${inner}</svg>`;
}

export const PIECE_THEMES = {
  modern: {
    name: "Modern Neo (Default)",
    wp: wrapSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linejoin="round" />`),
    wn: wrapSvg(`<g fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" /><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.66 1.44-1.5 1.5-.788-.347-1.284-1.93-1.5-2.5-.216-.57-.468-1.46-.5-2-.25-4.05 4.5-6.5 7-8 2.5-1.5 5.5-2 6.5-4 .84-1.68 1.5-4 1.5-4s2 .5 3.5 1.5c1.5 1 2 2 2 2" /><circle cx="16" cy="19" r="1.25" fill="#161b18" stroke="none" /></g>`),
    wb: wrapSvg(`<g fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" /><path d="M17.5 26h10M22.5 21v10" stroke-width="1.5" /></g>`),
    wr: wrapSvg(`<g fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" /><path d="M34 14l-3 3H14l-3-3" /><path d="M31 17v12.5H14V17" /><path d="M31 29.5l1.5 2.5h-20l1.5-2.5" /><path d="M11 14h23" /></g>`),
    wq: wrapSvg(`<g fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-14-3 15-5-12-3 12z" /><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" /><circle cx="6" cy="12" r="2" /><circle cx="14" cy="9" r="2" /><circle cx="22.5" cy="8" r="2" /><circle cx="31" cy="9" r="2" /><circle cx="39" cy="12" r="2" /></g>`),
    wk: wrapSvg(`<g fill="#ffffff" stroke="#161b18" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-width="1.8" /><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" /><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1 8-16 8s-12-9-16-8c-3 6 6 10.5 6 10.5v7z" /><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" /></g>`),
    bp: wrapSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linejoin="round" /><path d="M22.5 10c-1.6 0-2.9 1.3-2.9 2.9 0 .6.2 1.2.6 1.7.3.4.8.7 1.3.9" stroke="rgba(255,255,255,0.25)" stroke-width="1.2" fill="none" />`),
    bn: wrapSvg(`<g fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" /><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.66 1.44-1.5 1.5-.788-.347-1.284-1.93-1.5-2.5-.216-.57-.468-1.46-.5-2-.25-4.05 4.5-6.5 7-8 2.5-1.5 5.5-2 6.5-4 .84-1.68 1.5-4 1.5-4s2 .5 3.5 1.5c1.5 1 2 2 2 2" /><circle cx="16" cy="19" r="1.25" fill="#f3f5ef" stroke="none" /></g>`),
    bb: wrapSvg(`<g fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" /><path d="M17.5 26h10M22.5 21v10" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" /></g>`),
    br: wrapSvg(`<g fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" /><path d="M34 14l-3 3H14l-3-3" /><path d="M31 17v12.5H14V17" /><path d="M31 29.5l1.5 2.5h-20l1.5-2.5" /><path d="M11 14h23" stroke="rgba(255,255,255,0.25)" /></g>`),
    bq: wrapSvg(`<g fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-14-3 15-5-12-3 12z" /><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" /><circle cx="6" cy="12" r="2" /><circle cx="14" cy="9" r="2" /><circle cx="22.5" cy="8" r="2" /><circle cx="31" cy="9" r="2" /><circle cx="39" cy="12" r="2" /></g>`),
    bk: wrapSvg(`<g fill="#1b231e" stroke="#0d120f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-width="1.8" /><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" /><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1 8-16 8s-12-9-16-8c-3 6 6 10.5 6 10.5v7z" /><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="rgba(255,255,255,0.25)" /></g>`)
  },

  minimal: {
    name: "Minimal Geometric",
    wp: wrapSvg(`<circle cx="22.5" cy="16" r="6" fill="#fdfdfd" stroke="#101719" stroke-width="2"/><path d="M13 36h19c-2-8-6-12-9.5-12S15 28 13 36z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/>`),
    wn: wrapSvg(`<path d="M14 36h18c0-8 6-13-2-22-6-3-11 2-10 6-3 0-5 2-6 5 2 2 3 0 3 0s-3 3-3 6c3 1 5-1 5-1s-3 4-2 6z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/>`),
    wb: wrapSvg(`<path d="M22.5 8l-8 16c2 4 4 8 3 12h10c-1-4 1-8 3-12l-8-16z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/><circle cx="22.5" cy="7" r="2" fill="#101719"/>`),
    wr: wrapSvg(`<path d="M12 36h21V20l-3-4V11h-3v3h-3v-3h-3v3h-3v-3h-3v5l-3 4v16z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/>`),
    wq: wrapSvg(`<path d="M11 36h23l3-18-7 6-7.5-12L15 24l-7-6 3 18z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/><circle cx="22.5" cy="9" r="2.5" fill="#101719"/>`),
    wk: wrapSvg(`<path d="M12 36h21l3-16-7.5-3L22.5 24l-6-7-7.5 3 3 16z" fill="#fdfdfd" stroke="#101719" stroke-width="2"/><path d="M22.5 7v7M19 10.5h7" stroke="#101719" stroke-width="2.2"/>`),
    bp: wrapSvg(`<circle cx="22.5" cy="16" r="6" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/><path d="M13 36h19c-2-8-6-12-9.5-12S15 28 13 36z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/>`),
    bn: wrapSvg(`<path d="M14 36h18c0-8 6-13-2-22-6-3-11 2-10 6-3 0-5 2-6 5 2 2 3 0 3 0s-3 3-3 6c3 1 5-1 5-1s-3 4-2 6z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/>`),
    bb: wrapSvg(`<path d="M22.5 8l-8 16c2 4 4 8 3 12h10c-1-4 1-8 3-12l-8-16z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/><circle cx="22.5" cy="7" r="2" fill="#fdfdfd"/>`),
    br: wrapSvg(`<path d="M12 36h21V20l-3-4V11h-3v3h-3v-3h-3v3h-3v-3h-3v5l-3 4v16z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/>`),
    bq: wrapSvg(`<path d="M11 36h23l3-18-7 6-7.5-12L15 24l-7-6 3 18z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/><circle cx="22.5" cy="9" r="2.5" fill="#fdfdfd"/>`),
    bk: wrapSvg(`<path d="M12 36h21l3-16-7.5-3L22.5 24l-6-7-7.5 3 3 16z" fill="#202b25" stroke="#fdfdfd" stroke-width="1.8"/><path d="M22.5 7v7M19 10.5h7" stroke="#fdfdfd" stroke-width="2.2"/>`)
  },

  woodcraft: {
    name: "Classic Woodcraft",
    wp: wrapSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linejoin="round" /><path d="M16 35h13" stroke="#b08d55" stroke-width="1.5"/>`),
    wn: wrapSvg(`<g fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" /><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.66 1.44-1.5 1.5-.788-.347-1.284-1.93-1.5-2.5-.216-.57-.468-1.46-.5-2-.25-4.05 4.5-6.5 7-8 2.5-1.5 5.5-2 6.5-4 .84-1.68 1.5-4 1.5-4s2 .5 3.5 1.5c1.5 1 2 2 2 2" /><circle cx="16" cy="19" r="1.5" fill="#4a3525" stroke="none" /></g>`),
    wb: wrapSvg(`<g fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" /><path d="M17.5 26h10M22.5 21v10" stroke="#4a3525" stroke-width="1.8" /></g>`),
    wr: wrapSvg(`<g fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" /><path d="M34 14l-3 3H14l-3-3" /><path d="M31 17v12.5H14V17" /><path d="M31 29.5l1.5 2.5h-20l1.5-2.5" /><path d="M11 14h23" /></g>`),
    wq: wrapSvg(`<g fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-14-3 15-5-12-3 12z" /><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" /><circle cx="6" cy="12" r="2.2" /><circle cx="14" cy="9" r="2.2" /><circle cx="22.5" cy="8" r="2.2" /><circle cx="31" cy="9" r="2.2" /><circle cx="39" cy="12" r="2.2" /></g>`),
    wk: wrapSvg(`<g fill="#f7edd8" stroke="#4a3525" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-width="2.2" /><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" /><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1 8-16 8s-12-9-16-8c-3 6 6 10.5 6 10.5v7z" /><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" /></g>`),
    bp: wrapSvg(`<path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linejoin="round" />`),
    bn: wrapSvg(`<g fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" /><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0-.66 1.44-1.5 1.5-.788-.347-1.284-1.93-1.5-2.5-.216-.57-.468-1.46-.5-2-.25-4.05 4.5-6.5 7-8 2.5-1.5 5.5-2 6.5-4 .84-1.68 1.5-4 1.5-4s2 .5 3.5 1.5c1.5 1 2 2 2 2" /><circle cx="16" cy="19" r="1.5" fill="#f7edd8" stroke="none" /></g>`),
    bb: wrapSvg(`<g fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2zM15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z" /><path d="M17.5 26h10M22.5 21v10" stroke="rgba(247,237,216,0.35)" stroke-width="1.8" /></g>`),
    br: wrapSvg(`<g fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" /><path d="M34 14l-3 3H14l-3-3" /><path d="M31 17v12.5H14V17" /><path d="M31 29.5l1.5 2.5h-20l1.5-2.5" /><path d="M11 14h23" stroke="rgba(247,237,216,0.25)" /></g>`),
    bq: wrapSvg(`<g fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11-6-14-3 15-5-12-3 12z" /><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 2-1 .5-2.5 0 0 0-1.5-1.5-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" /><circle cx="6" cy="12" r="2.2" /><circle cx="14" cy="9" r="2.2" /><circle cx="22.5" cy="8" r="2.2" /><circle cx="31" cy="9" r="2.2" /><circle cx="39" cy="12" r="2.2" /></g>`),
    bk: wrapSvg(`<g fill="#3b281c" stroke="#1d130a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-width="2.2" /><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" /><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1 8-16 8s-12-9-16-8c-3 6 6 10.5 6 10.5v7z" /><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="rgba(247,237,216,0.3)" /></g>`)
  },

  neon: {
    name: "Cyber Neon",
    wp: wrapSvg(`<circle cx="22.5" cy="14" r="5" fill="none" stroke="#d8f36a" stroke-width="2.5"/><path d="M15 35h15l-3-12h-9z" fill="none" stroke="#d8f36a" stroke-width="2.5"/>`),
    wn: wrapSvg(`<path d="M14 35h17c0-8 6-12-2-21-6-2-11 3-9 7-4 0-6 3-6 7 2 2 4 0 4 0s-4 3-4 7z" fill="none" stroke="#d8f36a" stroke-width="2.5"/>`),
    wb: wrapSvg(`<path d="M22.5 8l-8 15c2 4 4 8 3 12h10c-1-4 1-8 3-12l-8-15z" fill="none" stroke="#d8f36a" stroke-width="2.5"/><circle cx="22.5" cy="7" r="2" fill="#d8f36a"/>`),
    wr: wrapSvg(`<path d="M13 35h19V20l-3-4V11h-3v3h-2v-3h-2v3h-2v-3h-3v5l-4 4v15z" fill="none" stroke="#d8f36a" stroke-width="2.5"/>`),
    wq: wrapSvg(`<path d="M11 35h23l3-17-7 6-7.5-12L15 24l-7-6 3 17z" fill="none" stroke="#d8f36a" stroke-width="2.5"/><circle cx="22.5" cy="9" r="2" fill="#d8f36a"/>`),
    wk: wrapSvg(`<path d="M12 35h21l3-15-7.5-3L22.5 24l-6-7-7.5 3 3 15z" fill="none" stroke="#d8f36a" stroke-width="2.5"/><path d="M22.5 7v6M19 10h7" stroke="#d8f36a" stroke-width="2.5"/>`),
    bp: wrapSvg(`<circle cx="22.5" cy="14" r="5" fill="none" stroke="#83dcda" stroke-width="2.5"/><path d="M15 35h15l-3-12h-9z" fill="none" stroke="#83dcda" stroke-width="2.5"/>`),
    bn: wrapSvg(`<path d="M14 35h17c0-8 6-12-2-21-6-2-11 3-9 7-4 0-6 3-6 7 2 2 4 0 4 0s-4 3-4 7z" fill="none" stroke="#83dcda" stroke-width="2.5"/>`),
    bb: wrapSvg(`<path d="M22.5 8l-8 15c2 4 4 8 3 12h10c-1-4 1-8 3-12l-8-15z" fill="none" stroke="#83dcda" stroke-width="2.5"/><circle cx="22.5" cy="7" r="2" fill="#83dcda"/>`),
    br: wrapSvg(`<path d="M13 35h19V20l-3-4V11h-3v3h-2v-3h-2v3h-2v-3h-3v5l-4 4v15z" fill="none" stroke="#83dcda" stroke-width="2.5"/>`),
    bq: wrapSvg(`<path d="M11 35h23l3-17-7 6-7.5-12L15 24l-7-6 3 17z" fill="none" stroke="#83dcda" stroke-width="2.5"/><circle cx="22.5" cy="9" r="2" fill="#83dcda"/>`),
    bk: wrapSvg(`<path d="M12 35h21l3-15-7.5-3L22.5 24l-6-7-7.5 3 3 15z" fill="none" stroke="#83dcda" stroke-width="2.5"/><path d="M22.5 7v6M19 10h7" stroke="#83dcda" stroke-width="2.5"/>`)
  },

  classic: {
    name: "Classic Unicode (Legacy)",
    isGlyph: true
  }
};

export const BOARD_THEMES = {
  sage: {
    name: "Sage Forest (Default)",
    light: "#e8ecda",
    dark: "#607b66"
  },
  wood: {
    name: "Walnut & Maple",
    light: "#f0d9b5",
    dark: "#b58863"
  },
  ocean: {
    name: "Deep Ocean Blue",
    light: "#dee3e6",
    dark: "#4c7399"
  },
  slate: {
    name: "Monochrome Slate",
    light: "#e2e8f0",
    dark: "#475569"
  },
  midnight: {
    name: "Midnight Dark",
    light: "#26342e",
    dark: "#141c19"
  }
};
