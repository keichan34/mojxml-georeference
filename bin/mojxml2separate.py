#!/usr/bin/env python3

import os
import sys
import xml.etree.ElementTree as ET

DEFAULT_NS = 'http://www.moj.go.jp/MINJI/tizuxml'
ET.register_namespace('', DEFAULT_NS)
ET.register_namespace('zmn', 'http://www.moj.go.jp/MINJI/tizuzumen')
NS = {
  '': DEFAULT_NS,
  'zmn': 'http://www.moj.go.jp/MINJI/tizuzumen'
}

def main(input):
  print("Opening file: " + input)
  tree = ET.parse(input)
  root = tree.getroot()

  for zukaku in root.findall('図郭', NS):
    # get the 地図番号 of the 図郭
    chizu_bango = zukaku.find('地図番号', NS).text
    print(chizu_bango)

    # reread the file, because we need a new copy
    new_tree = ET.parse(input)
    new_root = new_tree.getroot()
    # remove all zukaku elements
    for zukaku2 in new_root.findall('図郭', NS):
      new_root.remove(zukaku2)
    # add the current zukaku element
    new_root.append(zukaku)

    # get all 筆s that are in this zukaku
    fude_ids = set([ x.get('idref') for x in zukaku.findall('筆参照', NS) ])
    fude_root = new_root.find('主題属性', NS)
    for fude in fude_root.findall('筆', NS):
      if fude.get('id') not in fude_ids:
        fude_root.remove(fude)

    # write the new xml file
    output_filename = os.path.basename(input).replace('.xml', f'_{chizu_bango}.xml')
    output_path = os.path.join(os.path.dirname(input), output_filename)
    new_tree.write(
      output_path,
      encoding='utf-8',
      xml_declaration=True,
    )

if __name__ == '__main__':
  main(sys.argv[1])
