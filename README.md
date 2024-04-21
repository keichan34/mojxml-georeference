# 任意座標の再現できるGeoreference

* 1ファイルに図郭が複数ある
    * 図郭はそれぞれ、別にジオリファしないと
* それぞれの図郭にGCP3点からogr2ogrで変換

## 大体の流れ

1. XMLを図郭別にGeoJSON出力する(任意座標)
2. ogr2ogr変換
3. 統合

## このレポジトリー内のツール

* GCPをそれぞれの図郭とマッピングされた状態で保存する方法
* [GCPを作成するツール](https://keichan34.github.io/mojxml-georeference/tools/create-georeference/)
* XML分けるツール (`bin/mojxml2separate.py`)
* XMLから分けられたGeoJSONに変換するツール (`bin/moj2geojson-separate.sh`)
* ogr2ogr実行するツール
