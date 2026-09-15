"use strict";
/**
 * مبدل تومان/ریال و دلار
 * ------------------------------------------------------------
 * منطق کار:
 *  - در لحظه‌ی بارگذاری صفحه، نرخ واقعیِ لحظه‌ای دلار به تومان از چند منبع
 *    عمومی و رایگان (به‌ترتیب اولویت) دریافت می‌شود. اگر منبع اول جواب
 *    نداد یا داده‌ی نامعتبر برگرداند، به‌صورت خودکار سراغ منبع بعدی می‌رود؛
 *    فقط اگر همه‌ی منابع شکست بخورند از یک نرخ تقریبیِ آفلاین استفاده
 *    می‌شود و این موضوع صریحاً (با رنگ قرمز) به کاربر اطلاع داده می‌شود.
 *  - کاربر می‌تواند واحد نمایش پول ایران را بین «تومان» و «ریال» رسمی
 *    جابه‌جا کند (با کلیک روی ردیف تومان/ریال). عدد پایه همیشه به تومان در
 *    state نگه‌داری می‌شود؛ ریال فقط ضربی از همان مقدار در نمایش است.
 *  - برای جلوگیری از سرریز شدن رقم‌ها از صفحه، سقفی برای مبلغ دلار/تومان
 *    ورودی در نظر گرفته شده و در صورت عبور از آن، مقدار محدود و به کاربر
 *    اطلاع داده می‌شود.
 */
const CURRENCIES = {
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
/** مقدار پیش‌فرض ثابت دلار که همیشه مبنای محاسبه‌ی تومان پیش‌فرض است */
const DEFAULT_USD_AMOUNT = 1;
/** اگر همه‌ی منابع نرخ با خطا مواجه شدند، این عدد (تومان) به‌عنوان جایگزین استفاده می‌شود */
const FALLBACK_RATE = 233700;
/**
 * حداکثر مقداری که کاربر مجاز است در فیلد دلار وارد کند. جلوی سرریز شدن
 * رقم‌های تومان/ریالِ معادل از کادرها را می‌گیرد (مثلاً وارد کردن اعداد
 * نجومی مثل صد میلیارد دلار).
 */
const MAX_USD_AMOUNT = 1000000;
const state = {
    topCurrency: "USD",
    tomanPerUsd: null,
    amounts: { IRT: 0, USD: DEFAULT_USD_AMOUNT },
    rialMode: false,
};
/** واحد نمایشی جاریِ سمت ایران به‌صورت ضریب (تومان=۱، ریال=۱۰) */
function irtDisplayMultiplier() {
    return state.rialMode ? 10 : 1;
}
function irtUnitName() {
    return state.rialMode ? "ریال" : "تومان";
}
function irtUnitCode() {
    return state.rialMode ? "IRR" : "IRT";
}
function currencyName(code) {
    return code === "IRT" ? irtUnitName() : "دلار";
}
/** حداکثر مقدار مجاز تومان (پایه‌ی داخلی)، برگرفته از سقف دلار و نرخ فعلی */
function maxIrtToman() {
    if (!state.tomanPerUsd)
        return Number.POSITIVE_INFINITY;
    return MAX_USD_AMOUNT * state.tomanPerUsd;
}
const SUBSCRIPT_DIGITS = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
function toSubscript(n) {
    return String(n)
        .split("")
        .map((d) => { var _a; return (_a = SUBSCRIPT_DIGITS[Number(d)]) !== null && _a !== void 0 ? _a : d; })
        .join("");
}
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/**
 * ارقام فارسی/عربی و جداکننده‌های اعشاری آن‌ها را به معادل انگلیسی تبدیل
 * می‌کند. این تبدیل لازم است چون کیبورد بیشتر گوشی‌های ایرانی به‌صورت
 * پیش‌فرض روی ارقام فارسی است و بدون این تبدیل، ورودی کاربر پاک می‌شد.
 */
function normalizeDigits(input) {
    return input
        .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
        .replace(/٫/g, ".") // جداکننده‌ی اعشاری عربی/فارسی
        .replace(/٬/g, ""); // جداکننده‌ی هزارگان عربی/فارسی
}
/** رشته‌ی عددی را از جداکننده‌ها و کاراکترهای غیرعددی پاک می‌کند */
function parseAmount(raw) {
    const normalized = normalizeDigits(raw);
    const cleaned = normalized.replace(/[^\d.]/g, "");
    const value = parseFloat(cleaned);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}
/** عدد را با جداکننده‌ی هزارگان نمایش می‌دهد (برای مبالغ معمولی) */
function formatAmount(value, maxFractionDigits = 3) {
    if (!Number.isFinite(value))
        return "0";
    return value.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}
/**
 * اعداد خیلی کوچک را به شکل فشرده نمایش می‌دهد، مثلاً
 * 0.0000042667 → "0.0₅4267" (۵ صفر پس از ممیز، سپس رقم‌های معنادار)
 */
function formatCompactSmall(value, significantDigits = 4) {
    var _a;
    if (!Number.isFinite(value) || value <= 0)
        return "0";
    if (value >= 0.01)
        return formatAmount(value, significantDigits);
    const fixed = value.toFixed(12);
    const decimals = (_a = fixed.split(".")[1]) !== null && _a !== void 0 ? _a : "";
    let zeroCount = 0;
    while (decimals[zeroCount] === "0")
        zeroCount++;
    const significant = decimals.slice(zeroCount, zeroCount + significantDigits).padEnd(significantDigits, "0");
    return `0.0${toSubscript(zeroCount)}${significant}`;
}
function getElements() {
    const byId = (id) => {
        const el = document.getElementById(id);
        if (!el)
            throw new Error(`Element #${id} not found`);
        return el;
    };
    return {
        rateStatus: byId("rateStatus"),
        refreshBtn: byId("refreshBtn"),
        limitHint: byId("limitHint"),
        flagTop: byId("flagTop"),
        flagBottom: byId("flagBottom"),
        codeTop: byId("codeTop"),
        codeBottom: byId("codeBottom"),
        selectTop: byId("selectTop"),
        selectBottom: byId("selectBottom"),
        inputTop: byId("inputTop"),
        inputBottom: byId("inputBottom"),
        swapBtn: byId("swapBtn"),
        headlineBase: byId("headlineBase"),
        headlineBaseUnit: byId("headlineBaseUnit"),
        headlineQuote: byId("headlineQuote"),
        headlineQuoteUnit: byId("headlineQuoteUnit"),
        rateValue: byId("rateValue"),
    };
}
function bottomCurrencyOf(top) {
    return top === "IRT" ? "USD" : "IRT";
}
function usdFromIrt(irtToman) {
    return state.tomanPerUsd && state.tomanPerUsd > 0 ? irtToman / state.tomanPerUsd : 0;
}
function irtFromUsd(usd) {
    return state.tomanPerUsd ? usd * state.tomanPerUsd : 0;
}
/** مقدار داخلی (همیشه تومان برای IRT) را برای نمایش در فیلد آماده می‌کند */
function displayValueOf(code) {
    return code === "IRT" ? state.amounts.IRT * irtDisplayMultiplier() : state.amounts.USD;
}
let limitHintTimer;
function showLimitHint(els, message) {
    els.limitHint.textContent = message;
    els.limitHint.classList.add("is-visible");
    if (limitHintTimer)
        window.clearTimeout(limitHintTimer);
    limitHintTimer = window.setTimeout(() => {
        els.limitHint.classList.remove("is-visible");
    }, 3500);
}
function renderCurrencyRows(els) {
    const top = CURRENCIES[state.topCurrency];
    const bottom = CURRENCIES[bottomCurrencyOf(state.topCurrency)];
    els.flagTop.innerHTML = top.buildFlagSvg();
    els.flagTop.className = `flag-icon ${top.flagClass}`;
    els.codeTop.textContent = top.code === "IRT" ? irtUnitCode() : top.code;
    els.flagBottom.innerHTML = bottom.buildFlagSvg();
    els.flagBottom.className = `flag-icon ${bottom.flagClass}`;
    els.codeBottom.textContent = bottom.code === "IRT" ? irtUnitCode() : bottom.code;
    // فقط ردیف تومان/ریال قابل‌کلیک است (برای سوییچ واحد نمایش)
    const toggleTitle = `تغییر واحد به ${state.rialMode ? "تومان" : "ریال"}`;
    els.selectTop.classList.toggle("is-toggleable", top.code === "IRT");
    els.selectTop.setAttribute("aria-haspopup", top.code === "IRT" ? "true" : "false");
    els.selectTop.title = top.code === "IRT" ? toggleTitle : "";
    els.selectBottom.classList.toggle("is-toggleable", bottom.code === "IRT");
    els.selectBottom.setAttribute("aria-haspopup", bottom.code === "IRT" ? "true" : "false");
    els.selectBottom.title = bottom.code === "IRT" ? toggleTitle : "";
    els.inputTop.value = formatAmount(displayValueOf(top.code));
    els.inputBottom.value = state.tomanPerUsd === null ? "…" : formatAmount(displayValueOf(bottom.code));
    els.inputTop.setAttribute("aria-label", `مبلغ به ${currencyName(top.code)}`);
    els.inputBottom.setAttribute("aria-label", `مبلغ به ${currencyName(bottom.code)}`);
}
function renderSummary(els) {
    const topCode = state.topCurrency;
    const bottomCode = bottomCurrencyOf(topCode);
    els.headlineBase.textContent = formatAmount(displayValueOf(topCode));
    els.headlineBaseUnit.textContent = currencyName(topCode);
    els.headlineQuote.textContent = formatAmount(displayValueOf(bottomCode));
    els.headlineQuoteUnit.textContent = currencyName(bottomCode);
    if (state.tomanPerUsd === null) {
        els.rateValue.textContent = "…";
        return;
    }
    const m = irtDisplayMultiplier();
    els.rateValue.textContent =
        topCode === "IRT" ? formatCompactSmall(usdFromIrt(1 / m)) : formatAmount(irtFromUsd(1) * m, 0);
}
function renderAll(els) {
    renderCurrencyRows(els);
    renderSummary(els);
}
/** با تغییر مقدار در فیلد بالا یا پایین، مقدار متناظر از روی نرخ محاسبه می‌شود */
function recalcFromAmount(source, els) {
    if (state.tomanPerUsd === null)
        return; // تا وقتی نرخ نرسیده، محاسبه‌ای انجام نمی‌شود
    const topCode = state.topCurrency;
    const bottomCode = bottomCurrencyOf(topCode);
    const activeCode = source === "top" ? topCode : bottomCode;
    const activeInput = source === "top" ? els.inputTop : els.inputBottom;
    const otherCode = source === "top" ? bottomCode : topCode;
    const otherInput = source === "top" ? els.inputBottom : els.inputTop;
    const rawDisplay = parseAmount(activeInput.value);
    let clamped = false;
    if (activeCode === "USD") {
        let usd = rawDisplay;
        if (usd > MAX_USD_AMOUNT) {
            usd = MAX_USD_AMOUNT;
            clamped = true;
        }
        state.amounts.USD = usd;
        state.amounts.IRT = irtFromUsd(usd);
    }
    else {
        // مقدار نمایشی (که ممکن است ریال باشد) را به «تومان» پایه تبدیل می‌کنیم
        let toman = rawDisplay / irtDisplayMultiplier();
        const cap = maxIrtToman();
        if (toman > cap) {
            toman = cap;
            clamped = true;
        }
        state.amounts.IRT = toman;
        state.amounts.USD = usdFromIrt(toman);
    }
    if (clamped) {
        activeInput.value = formatAmount(displayValueOf(activeCode));
        showLimitHint(els, activeCode === "USD"
            ? `حداکثر مقدار مجاز ${formatAmount(MAX_USD_AMOUNT, 0)} دلار است.`
            : `مقدار وارد شده خیلی بزرگ است؛ به بیشترین حد مجاز (معادل ${formatAmount(MAX_USD_AMOUNT, 0)} دلار) محدود شد.`);
    }
    otherInput.value = formatAmount(displayValueOf(otherCode));
    renderSummary(els);
}
/**
 * صرافی نوبیتکس (nobitex.ir)، بزرگ‌ترین صرافی ارز دیجیتال ایران، یک API
 * عمومی و مستند و بدون نیاز به کلید برای قیمت لحظه‌ای جفت‌ارزها دارد.
 * از قیمت لحظه‌ای «تتر» (USDT) به ریال استفاده می‌کنیم، چون تتر پرمعامله‌ترین
 * و لحظه‌ای‌ترین پل بین تومان و دلار در بازار ایران است.
 *
 * نکته: نوبیتکس قیمت‌ها را به «ریال» برمی‌گرداند، پس برای تبدیل به تومان
 * تقسیم بر ۱۰ لازم است.
 */
async function fetchUsdtToTomanFromNobitex() {
    var _a, _b;
    const url = "https://api.nobitex.ir/market/stats";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ srcCurrency: "usdt", dstCurrency: "rls" }),
            signal: controller.signal,
            cache: "no-store",
        });
        if (!response.ok)
            return null;
        const data = (await response.json());
        if (data.status !== "ok")
            return null;
        const latestRaw = (_b = (_a = data.stats) === null || _a === void 0 ? void 0 : _a["usdt-rls"]) === null || _b === void 0 ? void 0 : _b.latest;
        const usdtRial = typeof latestRaw === "string" ? Number(latestRaw) : latestRaw;
        if (!Number.isFinite(usdtRial) || !usdtRial || usdtRial <= 0)
            return null;
        return usdtRial / 10; // ریال → تومان
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * دلار نقدیِ بازار آزاد معمولاً کمی از تتر گران‌تر معامله می‌شود (تتر
 * دیجیتال و در دسترس‌تر است؛ اسکناس فیزیکی دلار به‌خاطر کمیابی و تقاضای
 * بیشتر، معمولاً چند درصد گران‌تر می‌ماند). این عدد یک درصدِ قابل‌تنظیم
 * برای همان اختلاف است — اگر با نرخ واقعی بازار فاصله داشت، کافی است
 * همین مقدار را عوض کنی.
 */
const USD_PREMIUM_OVER_USDT = 0.015; // ۱.۵٪
/** نرخ لحظه‌ای دلار را از روی نرخ لحظه‌ای تتر (نوبیتکس) به‌علاوه‌ی درصد اختلاف بالا حساب می‌کند */
async function fetchFromNobitexUsdt() {
    const usdtToman = await fetchUsdtToTomanFromNobitex();
    if (usdtToman === null)
        return null;
    const usdToman = usdtToman * (1 + USD_PREMIUM_OVER_USDT);
    return { rate: usdToman, date: null, sourceLabel: null };
}
/**
 * تنها منبع نرخ: قیمت لحظه‌ای تتر از نوبیتکس، به‌علاوه‌ی محاسبه‌ی ریاضیِ
 * اختلاف با دلار نقدی (بالا). اگر این منبع در دسترس نبود (قطعی شبکه، مسدود
 * بودن CORS و غیره)، به نرخ تقریبی آفلاین برمی‌گردیم.
 */
const RATE_SOURCES = [fetchFromNobitexUsdt];
/** پس از مشخص‌شدن نرخ (واقعی یا جایگزین)، مقادیر اولیه و کل رابط کاربری را می‌سازد */
function applyRate(rate, els) {
    state.tomanPerUsd = rate;
    state.amounts.USD = DEFAULT_USD_AMOUNT;
    state.amounts.IRT = irtFromUsd(DEFAULT_USD_AMOUNT);
    els.inputBottom.disabled = false;
    els.swapBtn.disabled = false;
    renderAll(els);
}
/** پیام وضعیت را با گره‌های متنی امن می‌سازد (بدون innerHTML، بدون ریسک تزریق) */
function setStatusMessage(el, mainText, trailingText) {
    el.textContent = "";
    el.appendChild(document.createTextNode(mainText + (trailingText ? " " : "")));
    if (trailingText) {
        const bdi = document.createElement("bdi");
        bdi.textContent = trailingText;
        el.appendChild(bdi);
    }
}
/** به‌ترتیب منابع تعریف‌شده را امتحان می‌کند تا یکی نتیجه‌ی معتبر بدهد */
async function fetchLiveRate() {
    for (const source of RATE_SOURCES) {
        const result = await source();
        if (result)
            return result;
    }
    return null;
}
async function loadRate(els) {
    els.refreshBtn.disabled = true;
    setStatusMessage(els.rateStatus, "در حال دریافت نرخ لحظه‌ای دلار…", null);
    els.rateStatus.classList.remove("is-error");
    const result = await fetchLiveRate();
    if (result) {
        applyRate(result.rate, els);
        els.rateStatus.classList.remove("is-error");
        setStatusMessage(els.rateStatus, "نرخ لحظه‌ای دلار دریافت شد", null);
    }
    else {
        applyRate(FALLBACK_RATE, els);
        els.rateStatus.classList.add("is-error");
        setStatusMessage(els.rateStatus, "نرخ لحظه‌ای دریافت نشد؛ از مقدار تقریبی", `(${formatAmount(FALLBACK_RATE, 0)} تومان) استفاده شد`);
    }
    els.refreshBtn.disabled = false;
}
function toggleRialMode(els) {
    state.rialMode = !state.rialMode;
    renderAll(els);
}
function init() {
    const els = getElements();
    // تا رسیدن نرخ، فیلد دلار و دکمه‌ی سواپ غیرفعال هستند تا محاسبه‌ی نادرست
    // نمایش داده نشود
    renderCurrencyRows(els);
    els.swapBtn.disabled = true;
    els.inputTop.setAttribute("maxlength", "16");
    els.inputBottom.setAttribute("maxlength", "20");
    els.inputTop.addEventListener("input", () => recalcFromAmount("top", els));
    els.inputBottom.addEventListener("input", () => recalcFromAmount("bottom", els));
    els.inputTop.addEventListener("blur", () => {
        els.inputTop.value = formatAmount(displayValueOf(state.topCurrency));
    });
    els.inputBottom.addEventListener("blur", () => {
        els.inputBottom.value = formatAmount(displayValueOf(bottomCurrencyOf(state.topCurrency)));
    });
    els.swapBtn.addEventListener("click", () => {
        state.topCurrency = bottomCurrencyOf(state.topCurrency);
        renderCurrencyRows(els);
        renderSummary(els);
    });
    els.selectTop.addEventListener("click", () => {
        if (state.topCurrency === "IRT")
            toggleRialMode(els);
    });
    els.selectBottom.addEventListener("click", () => {
        if (bottomCurrencyOf(state.topCurrency) === "IRT")
            toggleRialMode(els);
    });
    els.refreshBtn.addEventListener("click", () => {
        void loadRate(els);
    });
    void loadRate(els);
}
document.addEventListener("DOMContentLoaded", init);
//# sourceMappingURL=main.js.map