# Harcama Ağacı

Maaştan maaşa (varsayılan: her ayın 15'i) harcamaları baloncuklarla gösteren kişisel web uygulaması.
Sunucu, hesap ya da ücret yok; veriler telefonun kendisinde saklanır.

## Özellikler
- **Merkez:** Maaş − sabit giderler − harcamalar = kalan para. Halka, ne kadarının harcandığını gösterir.
- **1. yörünge:** Kategoriler. Harcama arttıkça büyür, limite yaklaşınca halka sararır, limiti aşınca kırmızıya dönüp atmaya başlar.
- **2. yörünge:** Tekil harcamalar. Büyüklüğü tutara göre değişir.
- **Etkileşim:** Baloncuklar lastik gibi sürüklenir. Merkeze dokununca evren kapanır/açılır, iki parmakla yakınlaştırılır, boşluğa çift dokununca görünüm sıfırlanır.
- **Hızlı ekle:** "Starbucks 150" yazıp ekleyebilirsin; kategoriyi kendisi bulur. Kategoriyi elle düzeltirsen o ismi öğrenir.
- **Günlük limit:** "Günde X ₺ harcayabilirsin · maaşa N gün" ve plana göre hızlı mı yavaş mı gittiğin.
- **Hesap özeti içe aktarma:** Banka uygulamasından kopyalanan hareketleri satır satır ayırır.
- **Yedek:** Ayarlar → Yedeği kaydet / Yedekten yükle (JSON).

## Bilgisayarda deneme
```bash
node dev-server.mjs
```
Sonra http://localhost:5173 adresini aç.

## Telefona kurma
Uygulama, HTTPS ile yayınlanan statik bir sitedir; ücretsiz GitHub Pages yeterlidir.
Telefonda Safari ile aç → Paylaş → **Ana Ekrana Ekle**.

Dosyaları güncellediğinde `sw.js` içindeki `VERSION` değerini artır, böylece telefon yeni sürümü alır.
