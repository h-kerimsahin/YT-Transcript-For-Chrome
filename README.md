# YouTube Transcript Helper

Chrome / Edge için Manifest V3 uzantısı. YouTube video sayfasındaki beğeni düğmesinin yanında **Transkript** düğmesi görünür.

**Sürüm:** 1.4.19 · **Depo:** https://github.com/h-kerimsahin/YT-Transcript-For-Chrome

## İndirme

Hazır kurulum paketi (zip):

**[YT-Transcript-For-Chrome-v1.4.19.zip](https://github.com/h-kerimsahin/YT-Transcript-For-Chrome/releases/download/v1.4.19/YT-Transcript-For-Chrome-v1.4.19.zip)**

Tüm sürümler: [Releases](https://github.com/h-kerimsahin/YT-Transcript-For-Chrome/releases)

## Kurulum

1. Yukarıdaki zip dosyasını indirin ve bir klasöre çıkarın.
2. Chrome'da `chrome://extensions` (Edge'de `edge://extensions`) sayfasını açın.
3. **Geliştirici modu**nu açın, **Paketlenmemiş öğe yükle**yi seçin ve zip'ten çıkardığınız klasörü gösterin.
4. Uzantıyı eklentiler sayfasındaki yenile düğmesiyle yeniden yükleyin, ardından YouTube video sayfasını yenileyin.

> Geliştirme yapıyorsanız bu depoyu klonlayıp kök klasörü doğrudan da yükleyebilirsiniz.

## Kullanım

Transkript düğmesi kendi panelini açar; YouTube'un transkript menüsünü açmaz. Eklenti, altyazı metnini doğrudan YouTube sayfasının kendi oturumundan alır. Dil seçicisinde önce videonun kendi altyazısı seçilir; diğer mevcut altyazıları veya YouTube'un sunduğu otomatik çeviri dillerini de seçebilirsiniz. **Yenile** seçili dili yeniden yükler. Zaman kodu kutusunu işaretleyin veya kaldırın, ardından metni kopyalayın ya da TXT/Markdown biçiminde indirin.

Harici çeviri için paneldeki **API ayarları** bölümüne DeepL ve/veya Google Cloud Translation API anahtarınızı kaydedin. **Harici çeviri** menüsünden bir hedef dil seçildiğinde uzantı önce YouTube transkriptini alır, sonra:

1. Önce DeepL kotasını kullanır.
2. DeepL anahtarı yoksa veya 500.000 karakter sayaç limiti dolmuşsa Google Cloud Translation'a geçer.
3. Her iki servis için kullanım sayaçlarını panelde gösterir.

Uzantı videonun YouTube tarafından sunulan altyazılarını kullanır; altyazısı olmayan videolarda transkript oluşturamaz. Otomatik altyazılar dil seçicisinde ayrıca belirtilir.

## Dosya Yapısı

| Dosya | Açıklama |
| --- | --- |
| `manifest.json` | Uzantı tanımı (Manifest V3) |
| `background.js` | Service worker; API istekleri ve DeepL / Google çeviri |
| `content.js` | YouTube sayfasına enjekte edilen panel ve arayüz |
| `page-bridge.js` | Sayfa bağlamında çalışan transkript köprüsü |
| `styles.css` | Panel stilleri |

## Lisans

Belirtilmemiştir.
