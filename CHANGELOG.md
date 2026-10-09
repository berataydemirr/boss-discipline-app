# Değişiklik günlüğü

## v3.0.0 — Odak, plan, hatırlatıcılar, yedek
- Odak zamanlayıcısı (Pomodoro): odak / kısa / uzun mola, alışkanlığa bağlama, bitince otomatik işaretleme;
  telefon kilitlense ya da uygulama kapansa bile süre doğru (bitiş zamanı saklanır)
- Plan: haftalık ve aylık hedefler, dönemler arası gezinme, bitmeyenleri yeni döneme taşıma
- Hatırlatıcılar: alışkanlık başına saat, sabah öncelik ve akşam değerlendirme hatırlatması;
  Android'de arka plan kontrolü (Periodic Background Sync), bildirime dokununca uygulama açılır
- Yedek: JSON dışa aktarma (telefonda paylaş menüsü), doğrulamalı geri yükleme, tüm verileri silme,
  kalıcı depolama izni
- Analiz: odak süresi bölümü
- Alt menü 5 sekme: Bugün, Plan, Odak, Analiz, Günlük (Ayarlar: Bugün › sağ üst)
- Veritabanı şeması v2 (migration ile, v1 verisi kayıpsız taşınır)

## v2.0.0 — Analiz ve yansıma
- Analiz ekranı: seviye, puan, 12 aylık ısı haritası, haftalık oran, haftanın günleri deseni
- Alışkanlık ayrıntısı: seri, en iyi seri, 30 günlük oran, 6 aylık takvim
- Bırakılacak alışkanlıklar: temiz gün sayacı, kayma kaydı (geri alınabilir)
- Günün 3 önceliği
- Akşam değerlendirmesi: gün puanı, ruh hali, enerji, iki kısa soru
- Ruh hali içgörüleri: hangi alışkanlığın ruh haline etkisi var
- Puan, 9 seviye, 12 rozet (puanlar veriden hesaplanır, saklanmaz)
- Günlükte değerlendirme ve öncelikler de görünür ve aranır
- Alışkanlık renk paleti renk körlüğüne göre doğrulandı

## v1.0.0 — Temel
- Alışkanlık ekleme, düzenleme, sıralama, arşivleme, silme
- Günlük işaretleme, haftalık gün şeridi, geçmiş günleri doldurma
- Seri (streak) hesabı: planlı olmayan günler seriyi bozmaz, bugün henüz bitmediği için bekler
- Günün sözü: 55 yerleşik söz, kendi sözlerin, favoriler; tekrar etmeyen deterministik seçim
- Günlük not (otomatik kayıt) ve aranabilir Günlük ekranı
- Koyu/açık tema, 4 vurgu rengi
- Çevrimdışı çalışma (service worker), telefona kurulabilir (PWA)
- Debug: `?debug=1`, uygulama içi kayıt paneli, global hata yakalama
