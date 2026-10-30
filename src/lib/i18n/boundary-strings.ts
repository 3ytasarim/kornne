import type { Locale } from "./config";

/**
 * Strings for the CLIENT error / not-found boundaries. These components are part of every route's client bundle,
 * so importing the dictionaries there shipped all five languages (~110 KB of JS) to every visitor (Sprint 10
 * finding). Values are copied from the dictionaries; tests/unit/i18n.test.ts asserts they stay identical.
 */
export type BoundaryStrings = {
  error: { title: string; lead: string; retry: string };
  notFound: { title: string; lead: string; home: string; products: string };
  allProductsSlug: string | null;
};

export const BOUNDARY_STRINGS: Record<Locale, BoundaryStrings> = {
  tr: {
    error: {
      title: "Bir şeyler ters gitti",
      lead: "Sayfa yüklenirken beklenmeyen bir hata oluştu.",
      retry: "Tekrar dene"
    },
    notFound: {
      title: "Sayfa bulunamadı",
      lead: "Aradığınız sayfa taşınmış veya kaldırılmış olabilir.",
      home: "Anasayfaya dön",
      products: "Ürünlere göz at"
    },
    allProductsSlug: "tum-urunler"
  },
  en: {
    error: {
      title: "Something went wrong",
      lead: "An unexpected error occurred while loading the page.",
      retry: "Try again"
    },
    notFound: {
      title: "Page not found",
      lead: "The page you are looking for may have been moved or removed.",
      home: "Back to home",
      products: "Browse products"
    },
    allProductsSlug: "all-products"
  },
  fr: {
    error: {
      title: "Une erreur est survenue",
      lead: "Une erreur inattendue s'est produite lors du chargement.",
      retry: "Réessayer"
    },
    notFound: {
      title: "Page introuvable",
      lead: "La page recherchée a peut-être été déplacée ou supprimée.",
      home: "Retour à l'accueil",
      products: "Voir les produits"
    },
    allProductsSlug: "tous-les-produits"
  },
  ru: {
    error: {
      title: "Что-то пошло не так",
      lead: "При загрузке страницы произошла непредвиденная ошибка.",
      retry: "Повторить"
    },
    notFound: {
      title: "Страница не найдена",
      lead: "Возможно, страница была перемещена или удалена.",
      home: "На главную",
      products: "К продукции"
    },
    allProductsSlug: "vse-produkty"
  },
  ar: {
    error: {
      title: "حدث خطأ ما",
      lead: "حدث خطأ غير متوقع أثناء تحميل الصفحة.",
      retry: "إعادة المحاولة"
    },
    notFound: {
      title: "الصفحة غير موجودة",
      lead: "ربما نُقلت الصفحة التي تبحث عنها أو حُذفت.",
      home: "العودة إلى الرئيسية",
      products: "تصفّح المنتجات"
    },
    allProductsSlug: "all-products"
  }
};
