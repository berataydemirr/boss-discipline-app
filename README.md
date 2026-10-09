# BOSS

> Kendi kendinin patronu ol.

Kişisel disiplin uygulaması: alışkanlık takibi, günün sözü, öncelikler, akşam değerlendirmesi,
odak zamanlayıcısı, haftalık/aylık hedefler ve analiz. Telefona kurulabilen, internetsiz çalışan bir PWA.

Sunucu yok, hesap yok: **tüm veriler telefonunda** (IndexedDB) durur.

## Özellikler

| Ekran | Ne var |
|---|---|
| **Bugün** | Hafta şeridi, günün sözü, günün 3 önceliği, alışkanlıklar (seri, son 7 gün), bırakılacaklar (temiz gün sayacı), akşam değerlendirmesi, not |
| **Plan** | Haftalık ve aylık hedefler, bitmeyenleri yeni döneme taşıma |
| **Odak** | Pomodoro: odak / kısa mola / uzun mola, alışkanlığa bağlama, bitince otomatik işaretleme |
| **Analiz** | Seviye ve puan, 12 aylık ısı haritası, haftalık oran, gün deseni, alışkanlık tablosu, odak süresi, ruh hali içgörüleri, rozetler |
| **Günlük** | Geçmiş notlar ve değerlendirmeler, arama |
| **Ayarlar** (Bugün › sağ üst) | Tema, vurgu rengi, sözler, hatırlatıcılar, odak süreleri, yedek al / geri yükle, debug |

## Telefona kurma

Uygulamanın bir adreste (HTTPS) yayınlanması gerekiyor. En kolayı **GitHub Pages** (ücretsiz):

1. GitHub'da yeni bir depo aç (ör. `boss-discipline-app`), bu klasörü oraya gönder:
   ```bash
   git remote add origin https://github.com/KULLANICI_ADIN/boss-discipline-app.git
   git push -u origin main
   ```
2. Depoda **Settings › Pages › Build and deployment › Source: Deploy from a branch**,
   branch: `main`, klasör: `/ (root)` → Save.
3. Bir dakika sonra adres hazır: `https://KULLANICI_ADIN.github.io/boss-discipline-app/`
4. Telefonda aç:
   - **iPhone:** Safari ile aç › Paylaş › **Ana Ekrana Ekle**. (Bildirimler için uygulamayı ana ekrandan açmak şart.)
   - **Android:** Chrome ile aç › ⋮ menü › **Uygulamayı yükle**.

Netlify / Vercel / Cloudflare Pages da olur: klasörü olduğu gibi yükle, derleme adımı yok.

## Güncelleme yayınlarken

Kodu değiştirdiğinde **`js/version.js` içindeki sürüm numarasını artır**. Service worker yeni sürümü
indirir, telefonda “Yeni sürüm hazır · Yenile” bildirimi çıkar. Sürümü artırmazsan telefon eski
önbellekten açmaya devam eder.

## Bilgisayarda çalıştırma

```bash
python -m http.server 8080      # ya da: npm run serve
```
Tarayıcıda `http://localhost:8080` aç. (Dosyayı çift tıklayıp `file://` ile açmak çalışmaz; modüller ve service worker için sunucu gerekir.)

## Hata ayıklama

- **`?debug=1`** ile aç (ör. `http://localhost:8080/?debug=1`): her işlem konsola ayrıntılı yazılır. `?debug=0` kapatır.
  Ayarlar › Geliştirici › Debug modu ile telefonda da açılabilir.
- **Ayarlar › Geliştirici › Kayıtlar:** son 400 kayıt uygulama içinde; “Kopyala” ile tamamı panoya alınır.
  Uygulama çökse bile kayıtlar saklanır, bir sonraki açılışta okunabilir.
- Beklenmeyen her hata yakalanır, kaydedilir ve “Ayrıntı” bağlantılı bir uyarı gösterilir.
- **Konsoldan:** `disiplin.store.debugSnapshot()`, `disiplin.logs()`, `disiplin.setDebug(true)`
- **`?nosw=1`:** service worker'ı ve önbelleği kaldırır (geliştirirken eski dosya sorununa karşı).
  Telefonda aynısı: Ayarlar › Geliştirici › Önbelleği temizle.

## Testler

```bash
npm test
```
Node'un yerleşik test çalıştırıcısı; bağımlılık yok. Kapsam: tarih hesapları (DST, artık yıl, ISO hafta),
seri ve oran kuralları, bırakılacak sayaçları, istatistikler, puan/seviye/rozet, günün sözü seçimi,
girdi doğrulama, hatırlatıcı kuralları, yedek doğrulama (bozuk dosya, tur testi) ve
service worker önbellek listesinin diskteki dosyalarla tutarlılığı.

## Proje yapısı

```
index.html, manifest.webmanifest, sw.js
css/          tokens (renkler, yazı) · base · components · views · charts · insights · plan-focus
js/
  version.js        tek sürüm kaynağı
  reminder-core.js  hatırlatma kuralları (sayfa + service worker ortak)
  main.js           giriş, global hata yakalama, menü
  core/             logger, dates, db (IndexedDB + migration), store, validate, router
  logic/            SAF hesaplar: streaks, stats, summary, gamification, quotes, backup-schema
  features/         focus (zamanlayıcı), reminders, backup
  ui/               dom, icons, sheet, toast, theme, charts, formlar
  views/            today, plan, focus, stats, journal, habits, settings
tests/              node --test birim testleri
```

Kurallar: `logic/` ve `core/dates.js`, `core/validate.js` DOM'a dokunmaz, Node'da test edilir.
Tüm yazmalar `store` üzerinden, doğrulamadan geçerek ve tek kuyrukta sırayla yapılır.
Veritabanı şeması değişince `core/db.js` içindeki `MIGRATIONS`'a yeni sürüm eklenir; eskisi değiştirilmez.

## Bilinen sınırlar

- **Veriler yalnızca bu cihazda.** Telefon değişirse ya da tarayıcı verisi silinirse kaybolur:
  Ayarlar › Veri › **Yedeği dışa aktar** ile ara ara yedek al (dosyayı Drive'a/iCloud'a koy).
  “Kalıcı depolama” iznini istemek, tarayıcının yer açarken veriyi silmesini önler.
- **Hatırlatıcılar:** uygulama açıkken her zaman çalışır. Kapalıyken Android'de (Chrome ile kurulu)
  tarayıcının belirlediği aralıklarla (≈ saatte bir) kontrol edilir; iPhone'da yalnızca uygulama
  açıldığında gösterilir. Tam saatinde, uygulama kapalıyken gelen bildirim için bir push sunucusu gerekir.
- **Odak zamanlayıcısı** telefon kilitliyken de doğru sayar (bitiş zamanı saklanır), ama bitiş sesi/bildirimi
  yalnızca uygulama açıkken ya da arka planda canlıyken çalar; geri dönünce oturum yine kaydedilir.
