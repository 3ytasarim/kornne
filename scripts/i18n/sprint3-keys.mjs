// One-off helper (kept for traceability): inserts the Sprint 3 UI keys (quote, listing, search help, home facts)
// into every dictionary right before the `preview` section. Idempotent: skips files that already contain `quote:`.
import { readFileSync, writeFileSync } from "node:fs";

const KEYS = {
  tr: {
    quote: { title: "Fiyat teklif ile verilir", text: "Güncel fiyat, KDV ve teslim koşulları doğrulanana kadar fiyatlar teklif ile paylaşılır. Ürün bağlantısıyla yazın; ekibimiz fiyat, teslim süresi ve kurulum bilgisini iletsin.", cta: "Teklif al", whatsapp: "WhatsApp ile teklif iste", email: "E-posta ile teklif iste", emailSubject: "Teklif talebi: {product}", emailBody: "Merhaba, {url} için fiyat teklifi rica ediyorum.", cardLabel: "Fiyat için teklif alın" },
    listing: { sort: "Sırala", sortFeatured: "Önerilen", sortNameAsc: "Ad (A–Z)", sortNameDesc: "Ad (Z–A)", filter: "Bu listede ara", filterPlaceholder: "Ürün adı veya açıklama…", categoryFilter: "Kategori", all: "Tümü", clear: "Filtreleri temizle", showing: "{count} ürün", noMatch: "Seçilen filtrelerle eşleşen ürün yok.", turkishContent: "Türkçe içerik", filters: "Filtreler", apply: "Uygula" },
    searchHelp: { tips: "Daha kısa ya da farklı bir kelime deneyin (ör. “testere”, “kanca”, “sterilizatör”).", browse: "Kategorilere göz atın", popular: "Öne çıkan ürünler", minChars: "En az 2 karakter yazın." },
    homeFacts: { products: "ürün", categories: "kategori", languages: "dil", location: "Dilovası / Kocaeli", lineTitle: "Kesim hattı makineleri", lineLead: "Robotik kesim hücreleri, testereler ve hat ekipmanları.", hygieneTitle: "Hijyen ve kasap ekipmanları", hygieneLead: "Sterilizatörler, lavabolar, bot ve önlük yıkama, bıçak ve kancalar.", explore: "Kategoriyi incele" },
  },
  en: {
    quote: { title: "Price on request", text: "Until current prices, VAT and delivery terms are confirmed, prices are shared by quotation. Send us the product link and our team will reply with price, lead time and installation details.", cta: "Request a quote", whatsapp: "Request a quote on WhatsApp", email: "Request a quote by email", emailSubject: "Quote request: {product}", emailBody: "Hello, I would like a price quotation for {url}.", cardLabel: "Price on request" },
    listing: { sort: "Sort", sortFeatured: "Recommended", sortNameAsc: "Name (A–Z)", sortNameDesc: "Name (Z–A)", filter: "Search this list", filterPlaceholder: "Product name or description…", categoryFilter: "Category", all: "All", clear: "Clear filters", showing: "{count} products", noMatch: "No products match the selected filters.", turkishContent: "Turkish content", filters: "Filters", apply: "Apply" },
    searchHelp: { tips: "Try a shorter or different word (e.g. “saw”, “hook”, “sterilizer”).", browse: "Browse categories", popular: "Featured products", minChars: "Type at least 2 characters." },
    homeFacts: { products: "products", categories: "categories", languages: "languages", location: "Dilovası / Kocaeli, Türkiye", lineTitle: "Slaughter line machines", lineLead: "Robotic cutting cells, saws and line equipment.", hygieneTitle: "Hygiene and butchery equipment", hygieneLead: "Sterilizers, sinks, boot and apron washers, knives and hooks.", explore: "Explore category" },
  },
  fr: {
    quote: { title: "Prix sur devis", text: "Tant que les prix, la TVA et les conditions de livraison ne sont pas confirmés, les prix sont communiqués sur devis. Envoyez-nous le lien du produit ; notre équipe répond avec le prix, le délai et l'installation.", cta: "Demander un devis", whatsapp: "Devis sur WhatsApp", email: "Devis par e-mail", emailSubject: "Demande de devis : {product}", emailBody: "Bonjour, je souhaite un devis pour {url}.", cardLabel: "Prix sur devis" },
    listing: { sort: "Trier", sortFeatured: "Recommandé", sortNameAsc: "Nom (A–Z)", sortNameDesc: "Nom (Z–A)", filter: "Rechercher dans la liste", filterPlaceholder: "Nom ou description…", categoryFilter: "Catégorie", all: "Tout", clear: "Effacer les filtres", showing: "{count} produits", noMatch: "Aucun produit ne correspond aux filtres.", turkishContent: "Contenu en turc", filters: "Filtres", apply: "Appliquer" },
    searchHelp: { tips: "Essayez un mot plus court ou différent (ex. « scie », « crochet »).", browse: "Parcourir les catégories", popular: "Produits phares", minChars: "Saisissez au moins 2 caractères." },
    homeFacts: { products: "produits", categories: "catégories", languages: "langues", location: "Dilovası / Kocaeli, Turquie", lineTitle: "Machines de ligne d'abattage", lineLead: "Cellules de découpe robotisées, scies et équipements de ligne.", hygieneTitle: "Hygiène et boucherie", hygieneLead: "Stérilisateurs, lavabos, lave-bottes et lave-tabliers, couteaux et crochets.", explore: "Voir la catégorie" },
  },
  ru: {
    quote: { title: "Цена по запросу", text: "Пока актуальные цены, НДС и условия поставки не подтверждены, цены сообщаются по запросу. Отправьте нам ссылку на продукт — мы ответим ценой, сроком поставки и условиями монтажа.", cta: "Запросить цену", whatsapp: "Запросить цену в WhatsApp", email: "Запросить цену по эл. почте", emailSubject: "Запрос цены: {product}", emailBody: "Здравствуйте, прошу коммерческое предложение по {url}.", cardLabel: "Цена по запросу" },
    listing: { sort: "Сортировка", sortFeatured: "Рекомендуемые", sortNameAsc: "Название (А–Я)", sortNameDesc: "Название (Я–А)", filter: "Поиск в списке", filterPlaceholder: "Название или описание…", categoryFilter: "Категория", all: "Все", clear: "Сбросить фильтры", showing: "Продуктов: {count}", noMatch: "Нет продуктов, соответствующих фильтрам.", turkishContent: "Текст на турецком", filters: "Фильтры", apply: "Применить" },
    searchHelp: { tips: "Попробуйте более короткое или другое слово.", browse: "Категории", popular: "Избранная продукция", minChars: "Введите не менее 2 символов." },
    homeFacts: { products: "продуктов", categories: "категории", languages: "языков", location: "Дилованасы / Коджаэли, Турция", lineTitle: "Машины линии убоя", lineLead: "Роботизированные боксы, пилы и линейное оборудование.", hygieneTitle: "Гигиена и разделка", hygieneLead: "Стерилизаторы, раковины, мойки для обуви и фартуков, ножи и крюки.", explore: "Открыть категорию" },
  },
  ar: {
    quote: { title: "السعر عند الطلب", text: "إلى أن يتم تأكيد الأسعار الحالية وضريبة القيمة المضافة وشروط التسليم، تُقدَّم الأسعار عبر عرض سعر. أرسل لنا رابط المنتج وسيرد فريقنا بالسعر ومدة التسليم والتركيب.", cta: "اطلب عرض سعر", whatsapp: "اطلب عرض سعر عبر واتساب", email: "اطلب عرض سعر بالبريد الإلكتروني", emailSubject: "طلب عرض سعر: {product}", emailBody: "مرحبًا، أرجو تزويدي بعرض سعر لـ {url}.", cardLabel: "السعر عند الطلب" },
    listing: { sort: "ترتيب", sortFeatured: "مقترح", sortNameAsc: "الاسم (أ–ي)", sortNameDesc: "الاسم (ي–أ)", filter: "ابحث في القائمة", filterPlaceholder: "اسم المنتج أو الوصف…", categoryFilter: "الفئة", all: "الكل", clear: "مسح عوامل التصفية", showing: "{count} منتجات", noMatch: "لا توجد منتجات مطابقة لعوامل التصفية.", turkishContent: "محتوى باللغة التركية", filters: "التصفية", apply: "تطبيق" },
    searchHelp: { tips: "جرّب كلمة أقصر أو مختلفة.", browse: "تصفّح الفئات", popular: "منتجات مميزة", minChars: "اكتب حرفين على الأقل." },
    homeFacts: { products: "منتجًا", categories: "فئات", languages: "لغات", location: "ديلوفاسي / كوجالي، تركيا", lineTitle: "آلات خط الذبح", lineLead: "خلايا تقطيع روبوتية ومناشير ومعدات الخط.", hygieneTitle: "معدات النظافة والجزارة", hygieneLead: "معقمات ومغاسل وغسالات الأحذية والمرايل وسكاكين وخطافات.", explore: "استعرض الفئة" },
  },
};

for (const [locale, keys] of Object.entries(KEYS)) {
  const file = `src/lib/i18n/dictionaries/${locale}.ts`;
  let s = readFileSync(file, "utf8");
  if (s.includes("\n  quote: {")) continue;
  const block = Object.entries(keys).map(([k, v]) => `  ${k}: ${JSON.stringify(v, null, 4).replace(/\n/g, "\n  ").replace(/"([a-zA-Z]+)":/g, "$1:")},\n`).join("");
  s = s.replace(/\n {2}preview: \{/, `\n${block}  preview: {`);
  writeFileSync(file, s);
  console.log("updated", file);
}
