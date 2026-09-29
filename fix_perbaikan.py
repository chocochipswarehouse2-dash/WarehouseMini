with open('src/components/PerbaikanView.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    ': (namaFromCatalog?.p || namaFromCatalog?.nama_produk || skuKey);',
    ': (namaFromCatalog?.p || (namaFromCatalog?.nama_produk as string) || skuKey);'
)

with open('src/components/PerbaikanView.tsx', 'w') as f:
    f.write(content)
