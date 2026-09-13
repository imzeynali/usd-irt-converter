/**
 * مبدل تومان و دلار
 * ------------------------------------------------------------
 * منطق کار (بازنویسی‌شده):
 *  - دیگر فیلد دستی «نرخ هر دلار» وجود ندارد. به‌جای آن، در لحظه‌ی بارگذاری
 *    صفحه، نرخ واقعیِ لحظه‌ای دلار به تومان از یک منبع عمومی و رایگان
 *    (rate-json/Tomanify) دریافت و در همه‌ی محاسبات استفاده می‌شود.
 *  - مقدار پیش‌فرض تومان همیشه ۱,۰۰۰,۰۰۰ است؛ مقدار دلار متناظرش از روی
 *    همان نرخ واقعی محاسبه می‌شود (نه یک عدد ثابت و فرضی).
 *  - اگر دریافت نرخ با خطا مواجه شود (قطعی شبکه، مسدود بودن دامنه و…)، از
 *    یک نرخ پیش‌فرض محافظه‌کارانه استفاده می‌شود و این موضوع صریحاً به
 *    کاربر اطلاع داده می‌شود.
 *  - با تغییر مقدار در فیلد تومان یا دلار، مقدار دیگر بر اساس همین نرخِ
 *    دریافت‌شده بازمحاسبه می‌شود؛ خودِ نرخ توسط کاربر قابل‌ویرایش نیست.
 */

type CurrencyCode = "IRT" | "USD";

interface CurrencyMeta {
  code: CurrencyCode;
  flagClass: string;
  buildFlagSvg: () => string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  IRT: {
    code: "IRT",
    flagClass: "flag-ir",
    buildFlagSvg: () => `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="پرچم ایران">
        <clipPath id="clipIR"><circle cx="12" cy="12" r="12"/></clipPath>
        <g clip-path="url(#clipIR)">
          <rect width="24" height="8" y="0" fill="#239f40"/>
          <rect width="24" height="8" y="8" fill="#ffffff"/>
          <rect width="24" height="8" y="16" fill="#da0000"/>
        </g>
      </svg>`,
  },
  USD: {
    code: "USD",
    flagClass: "flag-us",
    buildFlagSvg: () => `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="پرچم آمریکا">
        <clipPath id="clipUS"><circle cx="12" cy="12" r="12"/></clipPath>
        <g clip-path="url(#clipUS)">
          <rect width="24" height="24" fill="#b22234"/>
          <g fill="#ffffff">
            <rect y="2" width="24" height="2"/>
            <rect y="6" width="24" height="2"/>
            <rect y="10" width="24" height="2"/>
            <rect y="14" width="24" height="2"/>
            <rect y="18" width="24" height="2"/>
            <rect y="22" width="24" height="2"/>
          </g>
          <rect width="11" height="12" fill="#3c3b6e"/>
        </g>
      </svg>`,
  },
};

const CURRENCY_NAMES: Record<CurrencyCode, string> = {
  IRT: "تومان",
  USD: "دلار",
};

/** مقدار پیش‌فرض ثابت دلار که همیشه مبنای محاسبه‌ی تومان پیش‌فرض است */
const DEFAULT_USD_AMOUNT = 1;

/** اگر دریافت نرخ واقعی با خطا مواجه شد، این عدد به‌عنوان جایگزین استفاده می‌شود */
const FALLBACK_RATE = 234_400;

/** منبع رایگان و بدون نیاز به کلید برای نرخ آزاد دلار به تومان (Tomanify) */
const RATE_API_URL = "https://raw.githubusercontent.com/rate-json/default/main/data.json";

interface AppState {
  topCurrency: CurrencyCode;
  /** نرخ مرجع: هر ۱ دلار برابر چند تومان است (از API دریافت می‌شود) */
  tomanPerUsd: number | null;
  /** مقدار فعلی هر ارز، همیشه با tomanPerUsd هم‌خوان نگه داشته می‌شود */
  amounts: Record<CurrencyCode, number>;
}

const state: AppState = {
  topCurrency: "USD",
  tomanPerUsd: null,
  amounts: { IRT: 0, USD: DEFAULT_USD_AMOUNT },
};

const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function toSubscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d)
    .join("");
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * ارقام فارسی/عربی و جداکننده‌های اعشاری آن‌ها را به معادل انگلیسی تبدیل
 * می‌کند. این تبدیل لازم است چون کیبورد بیشتر گوشی‌های ایرانی به‌صورت
 * پیش‌فرض روی ارقام فارسی است و بدون این تبدیل، ورودی کاربر پاک می‌شد.
 */
function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".") // جداکننده‌ی اعشاری عربی/فارسی
    .replace(/٬/g, ""); // جداکننده‌ی هزارگان عربی/فارسی
}

/** رشته‌ی عددی را از جداکننده‌ها و کاراکترهای غیرعددی پاک می‌کند */
function parseAmount(raw: string): number {
  const normalized = normalizeDigits(raw);
  const cleaned = normalized.replace(/[^\d.]/g, "");
  const value = parseFloat(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/** عدد را با جداکننده‌ی هزارگان نمایش می‌دهد (برای مبالغ معمولی) */
function formatAmount(value: number, maxFractionDigits = 3): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

/**
 * اعداد خیلی کوچک را به شکل فشرده نمایش می‌دهد، مثلاً
 * 0.0000042667 → "0.0₅4267" (۵ صفر پس از ممیز، سپس رقم‌های معنادار)
 */
function formatCompactSmall(value: number, significantDigits = 4): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 0.01) return formatAmount(value, significantDigits);

  const fixed = value.toFixed(12);
  const decimals = fixed.split(".")[1] ?? "";
  let zeroCount = 0;
  while (decimals[zeroCount] === "0") zeroCount++;

  const significant = decimals.slice(zeroCount, zeroCount + significantDigits).padEnd(significantDigits, "0");
  return `0.0${toSubscript(zeroCount)}${significant}`;
}

function formatMillionsToman(value: number): string {
  const millions = value / 1_000_000;
  return `${millions.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} میلیون ت`;
}

interface Elements {
  rateStatus: HTMLElement;
  flagTop: HTMLElement;
  flagBottom: HTMLElement;
  codeTop: HTMLElement;
  codeBottom: HTMLElement;
  inputTop: HTMLInputElement;
  inputBottom: HTMLInputElement;
  swapBtn: HTMLButtonElement;
  headlineBase: HTMLElement;
  headlineBaseUnit: HTMLElement;
  headlineQuote: HTMLElement;
  headlineQuoteUnit: HTMLElement;
  tomanValue: HTMLElement;
  rateValue: HTMLElement;
}

function getElements(): Elements {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} not found`);
    return el as T;
  };

  return {
    rateStatus: byId("rateStatus"),
    flagTop: byId("flagTop"),
    flagBottom: byId("flagBottom"),
    codeTop: byId("codeTop"),
    codeBottom: byId("codeBottom"),
    inputTop: byId("inputTop"),
    inputBottom: byId("inputBottom"),
    swapBtn: byId("swapBtn"),
    headlineBase: byId("headlineBase"),
    headlineBaseUnit: byId("headlineBaseUnit"),
    headlineQuote: byId("headlineQuote"),
    headlineQuoteUnit: byId("headlineQuoteUnit"),
    tomanValue: byId("tomanValue"),
    rateValue: byId("rateValue"),
  };
}

function bottomCurrencyOf(top: CurrencyCode): CurrencyCode {
  return top === "IRT" ? "USD" : "IRT";
}

function usdFromIrt(irt: number): number {
  return state.tomanPerUsd && state.tomanPerUsd > 0 ? irt / state.tomanPerUsd : 0;
}

function irtFromUsd(usd: number): number {
  return state.tomanPerUsd ? usd * state.tomanPerUsd : 0;
}

function renderCurrencyRows(els: Elements): void {
  const top = CURRENCIES[state.topCurrency];
  const bottom = CURRENCIES[bottomCurrencyOf(state.topCurrency)];

  els.flagTop.innerHTML = top.buildFlagSvg();
  els.flagTop.className = `flag-icon ${top.flagClass}`;
  els.codeTop.textContent = top.code;

  els.flagBottom.innerHTML = bottom.buildFlagSvg();
  els.flagBottom.className = `flag-icon ${bottom.flagClass}`;
  els.codeBottom.textContent = bottom.code;

  els.inputTop.value = formatAmount(state.amounts[top.code]);
  els.inputBottom.value = state.tomanPerUsd === null ? "…" : formatAmount(state.amounts[bottom.code]);

  els.inputTop.setAttribute("aria-label", `مبلغ به ${CURRENCY_NAMES[top.code]}`);
  els.inputBottom.setAttribute("aria-label", `مبلغ به ${CURRENCY_NAMES[bottom.code]}`);
}

function renderSummary(els: Elements): void {
  const topCode = state.topCurrency;
  const bottomCode = bottomCurrencyOf(topCode);

  els.headlineBase.textContent = formatAmount(state.amounts[topCode]);
  els.headlineBaseUnit.textContent = CURRENCY_NAMES[topCode];
  els.headlineQuote.textContent = formatAmount(state.amounts[bottomCode]);
  els.headlineQuoteUnit.textContent = CURRENCY_NAMES[bottomCode];

  els.tomanValue.textContent = formatMillionsToman(state.amounts.IRT);

  if (state.tomanPerUsd === null) {
    els.rateValue.textContent = "…";
    return;
  }

  els.rateValue.textContent =
    topCode === "IRT" ? formatCompactSmall(usdFromIrt(1)) : formatAmount(irtFromUsd(1), 0);
}

function renderAll(els: Elements): void {
  renderCurrencyRows(els);
  renderSummary(els);
}

/** با تغییر مقدار در فیلد بالا یا پایین، مقدار متناظر از روی نرخ محاسبه می‌شود */
function recalcFromAmount(source: "top" | "bottom", els: Elements): void {
  if (state.tomanPerUsd === null) return; // تا وقتی نرخ نرسیده، محاسبه‌ای انجام نمی‌شود

  const topCode = state.topCurrency;
  const bottomCode = bottomCurrencyOf(topCode);

  if (source === "top") {
    const raw = parseAmount(els.inputTop.value);
    state.amounts[topCode] = raw;
    state.amounts[bottomCode] = topCode === "IRT" ? usdFromIrt(raw) : irtFromUsd(raw);
    els.inputBottom.value = formatAmount(state.amounts[bottomCode]);
  } else {
    const raw = parseAmount(els.inputBottom.value);
    state.amounts[bottomCode] = raw;
    state.amounts[topCode] = bottomCode === "IRT" ? usdFromIrt(raw) : irtFromUsd(raw);
    els.inputTop.value = formatAmount(state.amounts[topCode]);
  }

  renderSummary(els);
}

interface RateApiResponse {
  generated_by_tomanify_at?: string;
  values?: { USD?: number };
}

/**
 * نرخ لحظه‌ای دلار به تومان را از یک منبع رایگان و بدون نیاز به کلید
 * دریافت می‌کند. داده از rate-json/Tomanify (بازار آزاد ایران) خوانده
 * می‌شود؛ در صورت خطا یا timeout، مقدار null برمی‌گرداند تا از نرخ
 * پیش‌فرض استفاده شود.
 */
async function fetchLiveRate(): Promise<{ rate: number; date: string | null } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(RATE_API_URL, { signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as RateApiResponse;
    const usd = data.values?.USD;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;

    return { rate: usd, date: data.generated_by_tomanify_at ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** پس از مشخص‌شدن نرخ (واقعی یا جایگزین)، مقادیر اولیه و کل رابط کاربری را می‌سازد */
function applyRate(rate: number, els: Elements): void {
  state.tomanPerUsd = rate;
  state.amounts.USD = DEFAULT_USD_AMOUNT;
  state.amounts.IRT = irtFromUsd(DEFAULT_USD_AMOUNT);

  els.inputBottom.disabled = false;
  els.swapBtn.disabled = false;
  renderAll(els);
}

const JALALI_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/**
 * تاریخ میلادی را به جلالی (شمسی) تبدیل می‌کند. الگوریتم استاندارد و رایج
 * تبدیل تقویم (jalaali-js) است، بدون نیاز به هیچ کتابخانه‌ی بیرونی.
 */
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const div = (a: number, b: number) => Math.floor(a / b);

  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];

  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  jy += div(days - 1, 365);
  if (days > 365) days = (days - 1) % 365;

  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);

  return [jy, jm, jd];
}

/** تاریخ امروز را به‌صورت «۲۳ شهریور ۱۴۰۵» برمی‌گرداند */
function formatTodayJalali(): string {
  const now = new Date();
  const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${jd} ${JALALI_MONTH_NAMES[jm - 1]} ${jy}`;
}

/** پیام وضعیت را با گره‌های متنی امن می‌سازد (بدون innerHTML، بدون ریسک تزریق) */
function setStatusMessage(el: HTMLElement, mainText: string, trailingText: string | null): void {
  el.textContent = "";
  el.appendChild(document.createTextNode(mainText + (trailingText ? " " : "")));
  if (trailingText) {
    const bdi = document.createElement("bdi");
    bdi.textContent = trailingText;
    el.appendChild(bdi);
  }
}

async function loadRate(els: Elements): Promise<void> {
  const result = await fetchLiveRate();
  const todayJalali = formatTodayJalali();

  if (result) {
    applyRate(result.rate, els);
    els.rateStatus.classList.remove("is-error");
    setStatusMessage(els.rateStatus, "به‌روزرسانی:", todayJalali);
  } else {
    applyRate(FALLBACK_RATE, els);
    els.rateStatus.classList.add("is-error");
    setStatusMessage(
      els.rateStatus,
      "نرخ لحظه‌ای دریافت نشد؛ از مقدار پیش‌فرض",
      `(${formatAmount(FALLBACK_RATE, 0)} تومان) استفاده شد`
    );
  }
}

function init(): void {
  const els = getElements();

  // تا رسیدن نرخ، فیلد دلار و دکمه‌ی سواپ غیرفعال هستند تا محاسبه‌ی نادرست
  // نمایش داده نشود
  renderCurrencyRows(els);
  els.swapBtn.disabled = true;

  els.inputTop.addEventListener("input", () => recalcFromAmount("top", els));
  els.inputBottom.addEventListener("input", () => recalcFromAmount("bottom", els));

  els.inputTop.addEventListener("blur", () => {
    els.inputTop.value = formatAmount(state.amounts[state.topCurrency]);
  });
  els.inputBottom.addEventListener("blur", () => {
    els.inputBottom.value = formatAmount(state.amounts[bottomCurrencyOf(state.topCurrency)]);
  });

  els.swapBtn.addEventListener("click", () => {
    state.topCurrency = bottomCurrencyOf(state.topCurrency);
    renderCurrencyRows(els);
    renderSummary(els);
  });

  void loadRate(els);
}

document.addEventListener("DOMContentLoaded", init);
