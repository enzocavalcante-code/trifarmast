// Catálogo inicial do Trifarmas (farmácias, remédios e recompensas).
// Preços são simulados para testes. A coluna "receita" indica se o remédio
// exige receita médica na retirada — revise com um farmacêutico antes de usar em produção.

const PHARMACIES = [
  { id: 'p1', name: 'Droga Raia',        dist: 0.4, domain: 'drogaraia.com.br',        priceBias: 1.00 },
  { id: 'p2', name: 'Drogasil',          dist: 0.7, domain: 'drogasil.com.br',         priceBias: 0.99 },
  { id: 'p3', name: 'Drogaria Pacheco',  dist: 0.9, domain: 'drogariaspacheco.com.br', priceBias: 1.07 },
  { id: 'p4', name: 'Pague Menos',       dist: 1.3, domain: 'paguemenos.com.br',       priceBias: 0.97 },
  { id: 'p5', name: 'Ultrafarma',        dist: 1.6, domain: 'ultrafarma.com.br',       priceBias: 0.92 },
  { id: 'p6', name: 'Panvel Farmácias',  dist: 2.1, domain: 'panvel.com',              priceBias: 1.02 },
];

// Categorias exibidas como filtros na busca.
const C = {
  DOR: 'Dor e febre',
  INFLAM: 'Anti-inflamatório',
  ANTIB: 'Antibiótico',
  ALERGIA: 'Alergia',
  CORACAO: 'Pressão e coração',
  DIABETES: 'Diabetes',
  COLESTEROL: 'Colesterol',
  ESTOMAGO: 'Estômago e intestino',
  GRIPE: 'Gripe e respiratório',
  VITAMINAS: 'Vitaminas',
  PELE: 'Pele e cabelo',
  MENTAL: 'Saúde mental e sono',
  TIREOIDE: 'Tireoide',
  MULHER: 'Saúde da mulher',
  OLHOS: 'Olhos',
  INFANTIL: 'Infantil',
  HOMEM: 'Saúde do homem',
  CUIDADOS: 'Cuidados e curativos',
};

// [id, nome, apresentação, princípio ativo, categoria, preço base (R$), exige receita, popularidade]
// Os 8 primeiros IDs já existiam e mantêm os preços originais (ver FIXED_PRICES).
const MEDICINES = [
  ['m1',  'Dipirona Sódica 500mg',            '10 comprimidos',     'Dipirona sódica',                         C.DOR,        12.9, false, 100],
  ['m2',  'Paracetamol 750mg',                '20 comprimidos',     'Paracetamol',                             C.DOR,         8.5, false, 98],
  ['m3',  'Amoxicilina 500mg',                '21 cápsulas',        'Amoxicilina',                             C.ANTIB,      22.0, true,  82],
  ['m4',  'Losartana Potássica 50mg',         '30 comprimidos',     'Losartana potássica',                     C.CORACAO,    15.9, true,  92],
  ['m5',  'Omeprazol 20mg',                   '28 cápsulas',        'Omeprazol',                               C.ESTOMAGO,   11.3, false, 86],
  ['m6',  'Ibuprofeno 400mg',                 '10 comprimidos',     'Ibuprofeno',                              C.INFLAM,     13.4, false, 90],
  ['m7',  'Loratadina 10mg',                  '12 comprimidos',     'Loratadina',                              C.ALERGIA,     8.2, false, 74],
  ['m8',  'Metformina 850mg',                 '30 comprimidos',     'Cloridrato de metformina',                C.DIABETES,   16.5, true,  84],

  // Dor e febre
  ['m9',  'Dipirona 1g',                      '10 comprimidos',     'Dipirona monoidratada',                   C.DOR,        14.9, false, 70],
  ['m10', 'Novalgina 1g',                     '10 comprimidos',     'Dipirona monoidratada',                   C.DOR,        24.9, false, 85],
  ['m11', 'Tylenol 750mg',                    '20 comprimidos',     'Paracetamol',                             C.DOR,        29.9, false, 80],
  ['m12', 'Dorflex',                          '36 comprimidos',     'Dipirona + orfenadrina + cafeína',        C.DOR,        26.9, false, 95],
  ['m13', 'Neosaldina',                       '30 drágeas',         'Dipirona + isometepteno + cafeína',       C.DOR,        34.9, false, 88],
  ['m14', 'Paracetamol Gotas 200mg/ml',       'Frasco 15 ml',       'Paracetamol',                             C.DOR,         9.9, false, 55],
  ['m15', 'Dipirona Gotas 500mg/ml',          'Frasco 20 ml',       'Dipirona sódica',                         C.DOR,         8.9, false, 68],
  ['m16', 'Ácido Acetilsalicílico 500mg',     '20 comprimidos',     'Ácido acetilsalicílico',                  C.DOR,        12.5, false, 40],
  ['m17', 'Aspirina 500mg',                   '20 comprimidos',     'Ácido acetilsalicílico',                  C.DOR,        18.9, false, 52],
  ['m18', 'Buscopan Composto',                '20 comprimidos',     'Escopolamina + dipirona',                 C.DOR,        27.9, false, 75],
  ['m20', 'Paracetamol + Codeína 500/30mg',   '12 comprimidos',     'Paracetamol + fosfato de codeína',        C.DOR,        35.9, true,  35],
  ['m21', 'Tramadol 50mg',                    '10 cápsulas',        'Cloridrato de tramadol',                  C.DOR,        28.9, true,  38],

  // Anti-inflamatório
  ['m22', 'Ibuprofeno 600mg',                 '20 comprimidos',     'Ibuprofeno',                              C.INFLAM,     22.9, true,  50],
  ['m23', 'Advil 400mg',                      '8 cápsulas',         'Ibuprofeno',                              C.INFLAM,     21.9, false, 72],
  ['m24', 'Nimesulida 100mg',                 '12 comprimidos',     'Nimesulida',                              C.INFLAM,     12.9, true,  78],
  ['m25', 'Diclofenaco Sódico 50mg',          '20 comprimidos',     'Diclofenaco sódico',                      C.INFLAM,      9.9, true,  60],
  ['m26', 'Cataflam 50mg',                    '10 comprimidos',     'Diclofenaco potássico',                   C.INFLAM,     32.9, true,  58],
  ['m27', 'Diclofenaco Gel 10mg/g',           'Bisnaga 60 g',       'Diclofenaco dietilamônio',                C.INFLAM,     19.9, false, 62],
  ['m28', 'Cetoprofeno 100mg',                '20 comprimidos',     'Cetoprofeno',                             C.INFLAM,     24.9, true,  40],
  ['m29', 'Naproxeno 500mg',                  '20 comprimidos',     'Naproxeno sódico',                        C.INFLAM,     26.9, true,  36],
  ['m30', 'Meloxicam 15mg',                   '10 comprimidos',     'Meloxicam',                               C.INFLAM,     19.9, true,  34],
  ['m31', 'Prednisona 20mg',                  '10 comprimidos',     'Prednisona',                              C.INFLAM,     11.9, true,  48],
  ['m32', 'Dexametasona 4mg',                 '10 comprimidos',     'Dexametasona',                            C.INFLAM,      9.9, true,  42],

  // Antibiótico
  ['m33', 'Amoxicilina + Clavulanato 875mg',  '14 comprimidos',     'Amoxicilina + clavulanato de potássio',   C.ANTIB,      69.9, true,  60],
  ['m34', 'Azitromicina 500mg',               '3 comprimidos',      'Azitromicina',                            C.ANTIB,      24.9, true,  76],
  ['m35', 'Cefalexina 500mg',                 '8 cápsulas',         'Cefalexina',                              C.ANTIB,      22.9, true,  58],
  ['m36', 'Ciprofloxacino 500mg',             '14 comprimidos',     'Cloridrato de ciprofloxacino',            C.ANTIB,      29.9, true,  54],
  ['m37', 'Levofloxacino 500mg',              '7 comprimidos',      'Levofloxacino',                           C.ANTIB,      49.9, true,  40],
  ['m38', 'Sulfametoxazol + Trimetoprima',    '20 comprimidos',     'Sulfametoxazol + trimetoprima',           C.ANTIB,      14.9, true,  38],
  ['m39', 'Doxiciclina 100mg',                '15 comprimidos',     'Doxiciclina',                             C.ANTIB,      34.9, true,  30],
  ['m40', 'Nitrofurantoína 100mg',            '28 cápsulas',        'Nitrofurantoína',                         C.ANTIB,      32.9, true,  32],
  ['m41', 'Metronidazol 400mg',               '24 comprimidos',     'Metronidazol',                            C.ANTIB,      18.9, true,  36],
  ['m42', 'Claritromicina 500mg',             '14 comprimidos',     'Claritromicina',                          C.ANTIB,      79.9, true,  28],

  // Alergia
  ['m43', 'Desloratadina 5mg',                '10 comprimidos',     'Desloratadina',                           C.ALERGIA,    19.9, false, 56],
  ['m44', 'Allegra 120mg',                    '10 comprimidos',     'Cloridrato de fexofenadina',              C.ALERGIA,    42.9, false, 70],
  ['m45', 'Fexofenadina 180mg',               '10 comprimidos',     'Cloridrato de fexofenadina',              C.ALERGIA,    34.9, false, 50],
  ['m46', 'Cetirizina 10mg',                  '12 comprimidos',     'Dicloridrato de cetirizina',              C.ALERGIA,    14.9, false, 46],
  ['m47', 'Dexclorfeniramina 2mg',            '20 comprimidos',     'Maleato de dexclorfeniramina',            C.ALERGIA,     9.9, false, 44],
  ['m48', 'Polaramine 2mg',                   '20 comprimidos',     'Maleato de dexclorfeniramina',            C.ALERGIA,    24.9, false, 52],
  ['m49', 'Levocetirizina 5mg',               '10 comprimidos',     'Dicloridrato de levocetirizina',          C.ALERGIA,    22.9, false, 34],
  ['m50', 'Hidroxizina 25mg',                 '30 comprimidos',     'Cloridrato de hidroxizina',               C.ALERGIA,    24.9, true,  38],
  ['m51', 'Budesonida Spray Nasal 32mcg',     '120 doses',          'Budesonida',                              C.ALERGIA,    39.9, true,  36],

  // Pressão e coração
  ['m53', 'Losartana Potássica 100mg',        '30 comprimidos',     'Losartana potássica',                     C.CORACAO,    24.9, true,  60],
  ['m54', 'Hidroclorotiazida 25mg',           '30 comprimidos',     'Hidroclorotiazida',                       C.CORACAO,     7.9, true,  58],
  ['m55', 'Anlodipino 5mg',                   '30 comprimidos',     'Besilato de anlodipino',                  C.CORACAO,    12.9, true,  80],
  ['m56', 'Enalapril 10mg',                   '30 comprimidos',     'Maleato de enalapril',                    C.CORACAO,     9.9, true,  52],
  ['m57', 'Captopril 25mg',                   '30 comprimidos',     'Captopril',                               C.CORACAO,     8.9, true,  46],
  ['m58', 'Atenolol 50mg',                    '30 comprimidos',     'Atenolol',                                C.CORACAO,    10.9, true,  48],
  ['m59', 'Propranolol 40mg',                 '30 comprimidos',     'Cloridrato de propranolol',               C.CORACAO,     7.9, true,  44],
  ['m60', 'Carvedilol 25mg',                  '30 comprimidos',     'Carvedilol',                              C.CORACAO,    19.9, true,  40],
  ['m61', 'Valsartana 160mg',                 '30 comprimidos',     'Valsartana',                              C.CORACAO,    54.9, true,  34],
  ['m62', 'Olmesartana 20mg',                 '30 comprimidos',     'Olmesartana medoxomila',                  C.CORACAO,    59.9, true,  32],
  ['m63', 'Furosemida 40mg',                  '20 comprimidos',     'Furosemida',                              C.CORACAO,     7.5, true,  38],
  ['m64', 'Espironolactona 25mg',             '30 comprimidos',     'Espironolactona',                         C.CORACAO,    17.9, true,  36],
  ['m65', 'Clopidogrel 75mg',                 '28 comprimidos',     'Bissulfato de clopidogrel',               C.CORACAO,    34.9, true,  34],
  ['m66', 'AAS Infantil 100mg',               '30 comprimidos',     'Ácido acetilsalicílico',                  C.CORACAO,     6.9, false, 65],
  ['m67', 'Xarelto 20mg',                     '28 comprimidos',     'Rivaroxabana',                            C.CORACAO,   239.9, true,  30],

  // Diabetes
  ['m68', 'Metformina 500mg',                 '30 comprimidos',     'Cloridrato de metformina',                C.DIABETES,    9.9, true,  56],
  ['m69', 'Glifage XR 500mg',                 '30 comprimidos',     'Cloridrato de metformina',                C.DIABETES,   18.9, true,  62],
  ['m70', 'Glibenclamida 5mg',                '30 comprimidos',     'Glibenclamida',                           C.DIABETES,    6.9, true,  40],
  ['m71', 'Gliclazida 30mg',                  '30 comprimidos',     'Gliclazida',                              C.DIABETES,   24.9, true,  38],
  ['m72', 'Sitagliptina 100mg',               '28 comprimidos',     'Fosfato de sitagliptina',                 C.DIABETES,  119.9, true,  30],
  ['m73', 'Dapagliflozina 10mg',              '30 comprimidos',     'Dapagliflozina',                          C.DIABETES,   99.9, true,  34],
  ['m74', 'Insulina NPH 100UI/ml',            'Frasco 10 ml',       'Insulina humana NPH',                     C.DIABETES,   59.9, true,  36],
  ['m75', 'Tiras para Glicemia',              '50 tiras',           'Tiras reagentes',                         C.DIABETES,   89.9, false, 42],

  // Colesterol
  ['m76', 'Sinvastatina 20mg',                '30 comprimidos',     'Sinvastatina',                            C.COLESTEROL, 12.9, true,  70],
  ['m77', 'Sinvastatina 40mg',                '30 comprimidos',     'Sinvastatina',                            C.COLESTEROL, 17.9, true,  52],
  ['m78', 'Atorvastatina 20mg',               '30 comprimidos',     'Atorvastatina cálcica',                   C.COLESTEROL, 29.9, true,  56],
  ['m79', 'Atorvastatina 40mg',               '30 comprimidos',     'Atorvastatina cálcica',                   C.COLESTEROL, 39.9, true,  44],
  ['m80', 'Rosuvastatina 10mg',               '30 comprimidos',     'Rosuvastatina cálcica',                   C.COLESTEROL, 34.9, true,  50],
  ['m81', 'Rosuvastatina 20mg',               '30 comprimidos',     'Rosuvastatina cálcica',                   C.COLESTEROL, 49.9, true,  40],
  ['m82', 'Ezetimiba 10mg',                   '30 comprimidos',     'Ezetimiba',                               C.COLESTEROL, 44.9, true,  30],
  ['m83', 'Ciprofibrato 100mg',               '30 comprimidos',     'Ciprofibrato',                            C.COLESTEROL, 39.9, true,  28],

  // Estômago e intestino
  ['m84', 'Omeprazol 40mg',                   '28 cápsulas',        'Omeprazol',                               C.ESTOMAGO,   29.9, true,  50],
  ['m85', 'Pantoprazol 40mg',                 '28 comprimidos',     'Pantoprazol sódico',                      C.ESTOMAGO,   34.9, true,  58],
  ['m86', 'Esomeprazol 40mg',                 '28 comprimidos',     'Esomeprazol magnésico',                   C.ESTOMAGO,   59.9, true,  40],
  ['m87', 'Domperidona 10mg',                 '30 comprimidos',     'Domperidona',                             C.ESTOMAGO,   18.9, true,  38],
  ['m88', 'Ondansetrona 8mg',                 '10 comprimidos',     'Cloridrato de ondansetrona',              C.ESTOMAGO,   34.9, true,  40],
  ['m89', 'Dramin B6',                        '10 comprimidos',     'Dimenidrinato + piridoxina',              C.ESTOMAGO,   17.9, false, 54],
  ['m90', 'Luftal 40mg',                      '20 comprimidos',     'Simeticona',                              C.ESTOMAGO,   15.9, false, 60],
  ['m91', 'Simeticona Gotas 75mg/ml',         'Frasco 10 ml',       'Simeticona',                              C.ESTOMAGO,    8.9, false, 46],
  ['m92', 'Estomazil',                        '6 envelopes',        'Bicarbonato + carbonato de sódio',        C.ESTOMAGO,   10.9, false, 50],
  ['m93', 'Sal de Fruta Eno',                 '10 envelopes',       'Bicarbonato de sódio + ácido cítrico',    C.ESTOMAGO,   16.9, false, 52],
  ['m94', 'Loperamida 2mg',                   '12 comprimidos',     'Cloridrato de loperamida',                C.ESTOMAGO,    9.9, false, 44],
  ['m95', 'Lactulose 667mg/ml',               'Frasco 120 ml',      'Lactulose',                               C.ESTOMAGO,   24.9, false, 36],
  ['m96', 'Floratil 200mg',                   '6 cápsulas',         'Saccharomyces boulardii',                 C.ESTOMAGO,   39.9, false, 48],
  ['m97', 'Buscopan 10mg',                    '20 drágeas',         'Butilbrometo de escopolamina',            C.ESTOMAGO,   19.9, false, 56],
  ['m98', 'Mylanta Plus',                     'Frasco 240 ml',      'Hidróxido de alumínio + magnésio',        C.ESTOMAGO,   34.9, false, 34],
  ['m99', 'Gaviscon Líquido',                 'Frasco 150 ml',      'Alginato de sódio + bicarbonato',         C.ESTOMAGO,   32.9, false, 38],

  // Gripe e respiratório
  ['m19', 'Cimegripe',                        '20 cápsulas',        'Paracetamol + clorfeniramina + fenilefrina', C.GRIPE,   15.9, false, 68],
  ['m100','Benegrip',                         '12 comprimidos',     'Dipirona + clorfeniramina + cafeína',     C.GRIPE,      14.9, false, 64],
  ['m101','Resfenol',                         '20 cápsulas',        'Paracetamol + clorfeniramina + fenilefrina', C.GRIPE,   19.9, false, 50],
  ['m102','Vick VapoRub',                     'Pote 30 g',          'Cânfora + mentol + eucalipto',            C.GRIPE,      21.9, false, 54],
  ['m103','Ambroxol Xarope Adulto',           'Frasco 120 ml',      'Cloridrato de ambroxol',                  C.GRIPE,      12.9, false, 48],
  ['m104','Acetilcisteína 600mg',             '16 envelopes',       'Acetilcisteína',                          C.GRIPE,      39.9, false, 44],
  ['m105','Mucosolvan Xarope Adulto',         'Frasco 120 ml',      'Cloridrato de ambroxol',                  C.GRIPE,      32.9, false, 40],
  ['m106','Xarope Vick 44E',                  'Frasco 120 ml',      'Dextrometorfano + guaifenesina',          C.GRIPE,      29.9, false, 38],
  ['m107','Salbutamol Spray 100mcg',          '200 doses',          'Sulfato de salbutamol',                   C.GRIPE,      24.9, true,  42],
  ['m108','Aerolin Spray 100mcg',             '200 doses',          'Sulfato de salbutamol',                   C.GRIPE,      34.9, true,  46],
  ['m109','Montelucaste 10mg',                '30 comprimidos',     'Montelucaste de sódio',                   C.GRIPE,      49.9, true,  34],
  ['m110','Soro Fisiológico 0,9%',            'Frasco 500 ml',      'Cloreto de sódio',                        C.GRIPE,       6.9, false, 58],
  ['m111','Rinosoro Spray 0,9%',              'Frasco 50 ml',       'Cloreto de sódio',                        C.GRIPE,      14.9, false, 44],
  ['m112','Neosoro Adulto',                   'Frasco 30 ml',       'Cloridrato de nafazolina',                C.GRIPE,       6.9, false, 50],
  ['m113','Strepsils',                        '8 pastilhas',        'Flurbiprofeno',                           C.GRIPE,      15.9, false, 46],
  ['m114','Oseltamivir 75mg',                 '10 cápsulas',        'Fosfato de oseltamivir',                  C.GRIPE,     149.9, true,  30],

  // Vitaminas
  ['m115','Vitamina D3 2.000UI',              '30 cápsulas',        'Colecalciferol',                          C.VITAMINAS,  29.9, false, 66],
  ['m116','Vitamina D3 50.000UI',             '4 cápsulas',         'Colecalciferol',                          C.VITAMINAS,  39.9, true,  44],
  ['m117','Vitamina C 1g Efervescente',       '10 comprimidos',     'Ácido ascórbico',                         C.VITAMINAS,  14.9, false, 58],
  ['m118','Redoxon 1g',                       '10 comprimidos',     'Ácido ascórbico',                         C.VITAMINAS,  24.9, false, 52],
  ['m119','Complexo B',                       '30 drágeas',         'Vitaminas do complexo B',                 C.VITAMINAS,  12.9, false, 40],
  ['m120','Ácido Fólico 5mg',                 '20 comprimidos',     'Ácido fólico',                            C.VITAMINAS,   6.9, true,  42],
  ['m121','Sulfato Ferroso 40mg',             '30 comprimidos',     'Sulfato ferroso',                         C.VITAMINAS,   7.9, false, 38],
  ['m122','Centrum Essentials',               '30 comprimidos',     'Polivitamínico',                          C.VITAMINAS,  59.9, false, 50],
  ['m123','Ômega 3 1000mg',                   '60 cápsulas',        'Óleo de peixe',                           C.VITAMINAS,  49.9, false, 46],
  ['m124','Magnésio Dimalato',                '60 cápsulas',        'Dimalato de magnésio',                    C.VITAMINAS,  39.9, false, 40],
  ['m125','Vitamina B12 1.000mcg',            '30 comprimidos',     'Cianocobalamina',                         C.VITAMINAS,  34.9, false, 36],

  // Pele e cabelo
  ['m126','Bepantol Derma Creme',             'Bisnaga 20 g',       'Dexpantenol',                             C.PELE,       29.9, false, 56],
  ['m127','Hipoglós',                         'Bisnaga 40 g',       'Óxido de zinco + vitaminas A e D',        C.PELE,       22.9, false, 50],
  ['m128','Nebacetin Pomada',                 'Bisnaga 15 g',       'Neomicina + bacitracina',                 C.PELE,       19.9, false, 48],
  ['m129','Cetoconazol Creme 20mg/g',         'Bisnaga 30 g',       'Cetoconazol',                             C.PELE,       14.9, false, 40],
  ['m130','Miconazol Creme 20mg/g',           'Bisnaga 28 g',       'Nitrato de miconazol',                    C.PELE,       12.9, false, 36],
  ['m131','Dexametasona Creme 1mg/g',         'Bisnaga 10 g',       'Acetato de dexametasona',                 C.PELE,        6.9, true,  38],
  ['m132','Aciclovir Creme 50mg/g',           'Bisnaga 10 g',       'Aciclovir',                               C.PELE,       12.9, false, 40],
  ['m133','Isotretinoína 20mg',               '30 cápsulas',        'Isotretinoína',                           C.PELE,      129.9, true,  30],
  ['m134','Minoxidil 5% Solução',             'Frasco 60 ml',       'Minoxidil',                               C.PELE,       59.9, false, 44],

  // Saúde mental e sono
  ['m135','Sertralina 50mg',                  '30 comprimidos',     'Cloridrato de sertralina',                C.MENTAL,     29.9, true,  72],
  ['m136','Escitalopram 10mg',                '30 comprimidos',     'Oxalato de escitalopram',                 C.MENTAL,     34.9, true,  62],
  ['m137','Fluoxetina 20mg',                  '30 cápsulas',        'Cloridrato de fluoxetina',                C.MENTAL,     14.9, true,  58],
  ['m138','Clonazepam 2mg',                   '30 comprimidos',     'Clonazepam',                              C.MENTAL,      9.9, true,  56],
  ['m139','Rivotril 2mg',                     '30 comprimidos',     'Clonazepam',                              C.MENTAL,     19.9, true,  54],
  ['m140','Alprazolam 0,5mg',                 '30 comprimidos',     'Alprazolam',                              C.MENTAL,     19.9, true,  44],
  ['m141','Zolpidem 10mg',                    '20 comprimidos',     'Hemitartarato de zolpidem',               C.MENTAL,     34.9, true,  42],
  ['m142','Quetiapina 25mg',                  '30 comprimidos',     'Fumarato de quetiapina',                  C.MENTAL,     29.9, true,  38],
  ['m143','Bupropiona 150mg',                 '30 comprimidos',     'Cloridrato de bupropiona',                C.MENTAL,     59.9, true,  34],
  ['m144','Venlafaxina 75mg',                 '30 cápsulas',        'Cloridrato de venlafaxina',               C.MENTAL,     64.9, true,  32],
  ['m145','Amitriptilina 25mg',               '30 comprimidos',     'Cloridrato de amitriptilina',             C.MENTAL,     12.9, true,  36],
  ['m146','Melatonina 0,21mg',                '60 cápsulas',        'Melatonina',                              C.MENTAL,     39.9, false, 50],

  // Tireoide
  ['m147','Levotiroxina 50mcg',               '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   12.9, true,  48],
  ['m148','Puran T4 50mcg',                   '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   16.9, true,  56],
  ['m149','Puran T4 100mcg',                  '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   18.9, true,  44],
  ['m150','Synthroid 75mcg',                  '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   24.9, true,  38],

  // Saúde da mulher
  ['m151','Selene',                           '21 comprimidos',     'Ciproterona + etinilestradiol',           C.MULHER,     29.9, true,  44],
  ['m152','Yasmin',                           '21 comprimidos',     'Drospirenona + etinilestradiol',          C.MULHER,     69.9, true,  46],
  ['m153','Ciclo 21',                         '21 comprimidos',     'Levonorgestrel + etinilestradiol',        C.MULHER,      9.9, true,  40],
  ['m154','Levonorgestrel 1,5mg',             '1 comprimido',       'Levonorgestrel',                          C.MULHER,     19.9, true,  42],
  ['m155','Fluconazol 150mg',                 '1 cápsula',          'Fluconazol',                              C.MULHER,      9.9, true,  46],
  ['m156','Teste de Gravidez',                '1 unidade',          'Teste rápido de hCG',                     C.MULHER,     14.9, false, 48],

  // Olhos
  ['m158','Lacrifilm Colírio',                'Frasco 15 ml',       'Carmelose sódica',                        C.OLHOS,      24.9, false, 44],
  ['m159','Systane Ultra',                    'Frasco 10 ml',       'Polietilenoglicol + propilenoglicol',     C.OLHOS,      49.9, false, 40],
  ['m160','Colírio Moura Brasil',             'Frasco 20 ml',       'Nafazolina + sulfato de zinco',           C.OLHOS,      12.9, false, 46],
  ['m161','Tobramicina Colírio 3mg/ml',       'Frasco 5 ml',        'Tobramicina',                             C.OLHOS,      22.9, true,  32],
  ['m162','Maxitrol Colírio',                 'Frasco 5 ml',        'Dexametasona + neomicina + polimixina B', C.OLHOS,      39.9, true,  34],

  // ---- ampliação do catálogo ----

  // Dor e febre
  ['m163','Anador 500mg',                      '20 comprimidos',     'Dipirona monoidratada',                   C.DOR,        10.9, false, 74],
  ['m164','Paracetamol 500mg',                 '20 comprimidos',     'Paracetamol',                             C.DOR,         7.9, false, 80],
  ['m165','Tylenol 500mg',                     '20 comprimidos',     'Paracetamol',                             C.DOR,        16.9, false, 76],
  ['m166','Tylenol DC 500mg + 65mg',           '20 comprimidos',     'Paracetamol + cafeína',                   C.DOR,        19.9, false, 58],
  ['m167','Lisador',                           '20 comprimidos',     'Dipirona + prometazina + adifenina',      C.DOR,        14.9, false, 54],
  ['m168','Doril Enxaqueca',                   '20 comprimidos',     'Ácido acetilsalicílico + cafeína',        C.DOR,        13.9, false, 56],
  ['m169','Dorflex Uno 5mg',                   '10 comprimidos',     'Ciclobenzaprina',                         C.DOR,        24.9, true,  50],
  ['m170','Miosan 5mg',                        '30 comprimidos',     'Ciclobenzaprina',                         C.DOR,        29.9, true,  46],
  ['m171','Tandrilax',                         '30 comprimidos',     'Carisoprodol + diclofenaco + paracetamol',C.DOR,        34.9, true,  52],
  ['m172','Torsilax',                          '30 comprimidos',     'Carisoprodol + diclofenaco + paracetamol',C.DOR,        32.9, true,  48],
  ['m173','Sumatriptana 50mg',                 '10 comprimidos',     'Succinato de sumatriptana',               C.DOR,        39.9, true,  40],
  ['m174','Naratriptana 2,5mg',                '4 comprimidos',      'Naratriptana',                            C.DOR,        44.9, true,  30],
  ['m184','Buscoduo',                          '20 comprimidos',     'Escopolamina + dipirona',                 C.DOR,        26.9, false, 52],

  // Anti-inflamatório
  ['m175','Nimesulida Gotas 50mg/ml',          'Frasco 15 ml',       'Nimesulida',                              C.INFLAM,     12.9, true,  54],
  ['m176','Diclofenaco Potássico 50mg',        '20 comprimidos',     'Diclofenaco potássico',                   C.INFLAM,     11.9, true,  58],
  ['m177','Piroxicam 20mg',                    '10 cápsulas',        'Piroxicam',                               C.INFLAM,     14.9, true,  40],
  ['m178','Celecoxibe 200mg',                  '10 cápsulas',        'Celecoxibe',                              C.INFLAM,     39.9, true,  38],
  ['m179','Etoricoxibe 90mg',                  '7 comprimidos',      'Etoricoxibe',                             C.INFLAM,     49.9, true,  36],
  ['m180','Prednisolona Gotas 3mg/ml',         'Frasco 20 ml',       'Prednisolona',                            C.INFLAM,     19.9, true,  42],
  ['m182','Cetoprofeno Gel 25mg/g',            'Bisnaga 60 g',       'Cetoprofeno',                             C.INFLAM,     24.9, false, 44],
  ['m183','Alivium 400mg',                     '20 comprimidos',     'Ibuprofeno',                              C.INFLAM,     18.9, false, 56],
  ['m242','Prednisolona 20mg',                 '10 comprimidos',     'Prednisolona',                            C.INFLAM,     17.9, true,  44],

  // Antibiótico
  ['m185','Cefalexina Suspensão 250mg/5ml',    'Frasco 100 ml',      'Cefalexina',                              C.ANTIB,      32.9, true,  48],
  ['m186','Amoxicilina Suspensão 250mg/5ml',   'Frasco 150 ml',      'Amoxicilina',                             C.ANTIB,      28.9, true,  54],
  ['m187','Norfloxacino 400mg',                '14 comprimidos',     'Norfloxacino',                            C.ANTIB,      24.9, true,  38],
  ['m188','Clindamicina 300mg',                '16 cápsulas',        'Cloridrato de clindamicina',              C.ANTIB,      42.9, true,  34],
  ['m189','Monuril 3g',                        '1 sachê',            'Fosfomicina trometamol',                  C.ANTIB,      39.9, true,  44],
  ['m190','Benzetacil 1.200.000UI',            '1 frasco-ampola',    'Penicilina G benzatina',                  C.ANTIB,      29.9, true,  32],
  ['m191','Bactrim F 800/160mg',               '20 comprimidos',     'Sulfametoxazol + trimetoprima',           C.ANTIB,      34.9, true,  40],
  ['m192','Azitromicina Suspensão 200mg/5ml',  'Frasco 15 ml',       'Azitromicina',                            C.ANTIB,      36.9, true,  46],
  ['m193','Tetraciclina 500mg',                '16 cápsulas',        'Cloridrato de tetraciclina',              C.ANTIB,      22.9, true,  28],

  // Alergia
  ['m194','Loratadina Xarope 1mg/ml',          'Frasco 100 ml',      'Loratadina',                              C.ALERGIA,    14.9, false, 52],
  ['m195','Prometazina 25mg',                  '20 comprimidos',     'Cloridrato de prometazina',               C.ALERGIA,    12.9, true,  36],
  ['m196','Mometasona Spray Nasal 50mcg',      'Frasco 120 doses',   'Furoato de mometasona',                   C.ALERGIA,    49.9, true,  44],
  ['m197','Cetirizina Gotas 10mg/ml',          'Frasco 20 ml',       'Cetirizina',                              C.ALERGIA,    16.9, false, 46],
  ['m198','Ebastina 10mg',                     '10 comprimidos',     'Ebastina',                                C.ALERGIA,    26.9, false, 32],

  // Pressão e coração
  ['m200','Losartana + Hidroclorotiazida 50/12,5mg','30 comprimidos','Losartana + hidroclorotiazida',           C.CORACAO,    19.9, true,  58],
  ['m201','Atenolol 25mg',                     '30 comprimidos',     'Atenolol',                                C.CORACAO,     9.9, true,  54],
  ['m202','Bisoprolol 5mg',                    '30 comprimidos',     'Fumarato de bisoprolol',                  C.CORACAO,    24.9, true,  44],
  ['m203','Metoprolol 50mg',                   '30 comprimidos',     'Succinato de metoprolol',                 C.CORACAO,    22.9, true,  46],
  ['m204','Nebivolol 5mg',                     '30 comprimidos',     'Cloridrato de nebivolol',                 C.CORACAO,    32.9, true,  38],
  ['m205','Anlodipino 10mg',                   '30 comprimidos',     'Besilato de anlodipino',                  C.CORACAO,    14.9, true,  56],
  ['m206','Nifedipino Retard 20mg',            '30 comprimidos',     'Nifedipino',                              C.CORACAO,    16.9, true,  36],
  ['m207','Ramipril 5mg',                      '30 comprimidos',     'Ramipril',                                C.CORACAO,    18.9, true,  40],
  ['m208','Telmisartana 40mg',                 '30 comprimidos',     'Telmisartana',                            C.CORACAO,    26.9, true,  44],
  ['m209','Candesartana 8mg',                  '30 comprimidos',     'Candesartana cilexetila',                 C.CORACAO,    28.9, true,  34],
  ['m210','Digoxina 0,25mg',                   '30 comprimidos',     'Digoxina',                                C.CORACAO,    12.9, true,  30],
  ['m211','Marevan 5mg',                       '30 comprimidos',     'Varfarina sódica',                        C.CORACAO,    19.9, true,  38],

  // Diabetes
  ['m212','Glimepirida 2mg',                   '30 comprimidos',     'Glimepirida',                             C.DIABETES,   14.9, true,  46],
  ['m213','Empagliflozina 25mg',               '30 comprimidos',     'Empagliflozina',                          C.DIABETES,  129.9, true,  42],
  ['m214','Linagliptina 5mg',                  '30 comprimidos',     'Linagliptina',                            C.DIABETES,  119.9, true,  38],
  ['m215','Insulina Regular 100UI/ml',         'Frasco 10 ml',       'Insulina humana regular',                 C.DIABETES,   49.9, true,  40],
  ['m216','Insulina Glargina 100UI/ml',        'Caneta 3 ml',        'Insulina glargina',                       C.DIABETES,   89.9, true,  44],
  ['m217','Lancetas para Glicemia',            '100 unidades',       'Lanceta descartável',                     C.DIABETES,   24.9, false, 36],
  ['m218','Agulhas para Caneta de Insulina',   '100 unidades',       'Agulha 4 mm',                             C.DIABETES,   39.9, false, 32],

  // Colesterol
  ['m219','Pravastatina 40mg',                 '30 comprimidos',     'Pravastatina sódica',                     C.COLESTEROL, 24.9, true,  36],
  ['m220','Fenofibrato 200mg',                 '30 cápsulas',        'Fenofibrato',                             C.COLESTEROL, 29.9, true,  34],
  ['m221','Sinvastatina + Ezetimiba 20/10mg',  '30 comprimidos',     'Sinvastatina + ezetimiba',                C.COLESTEROL, 49.9, true,  38],
  ['m222','Bezafibrato 400mg',                 '30 comprimidos',     'Bezafibrato',                             C.COLESTEROL, 27.9, true,  28],

  // Estômago e intestino
  ['m223','Famotidina 40mg',                   '20 comprimidos',     'Famotidina',                              C.ESTOMAGO,   16.9, true,  38],
  ['m224','Bromoprida 10mg',                   '20 cápsulas',        'Bromoprida',                              C.ESTOMAGO,   14.9, true,  46],
  ['m225','Metoclopramida 10mg',               '20 comprimidos',     'Cloridrato de metoclopramida',            C.ESTOMAGO,   11.9, true,  44],
  ['m226','Enterogermina',                     '10 flaconetes',      'Bacillus clausii',                        C.ESTOMAGO,   39.9, false, 54],
  ['m227','Repoflor',                          '6 cápsulas',         'Saccharomyces boulardii',                 C.ESTOMAGO,   34.9, false, 48],
  ['m228','Dulcolax 5mg',                      '20 drágeas',         'Bisacodil',                               C.ESTOMAGO,   24.9, false, 44],
  ['m229','Tamarine Geleia',                   'Pote 150 g',         'Cássia + tamarindo',                      C.ESTOMAGO,   29.9, false, 42],
  ['m230','Óleo Mineral',                      'Frasco 100 ml',      'Óleo mineral',                            C.ESTOMAGO,    9.9, false, 34],
  ['m231','Pepsamar',                          'Frasco 240 ml',      'Hidróxido de alumínio',                   C.ESTOMAGO,   19.9, false, 40],
  ['m232','Simeticona 125mg',                  '20 cápsulas',        'Simeticona',                              C.ESTOMAGO,   12.9, false, 50],

  // Gripe e respiratório
  ['m233','Naldecon Dia',                      '24 comprimidos',     'Paracetamol + fenilefrina + carbinoxamina',C.GRIPE,     18.9, false, 62],
  ['m234','Coristina D',                       '20 comprimidos',     'AAS + clorfeniramina + fenilefrina',      C.GRIPE,      14.9, false, 58],
  ['m235','Tylenol Sinus',                     '24 comprimidos',     'Paracetamol + pseudoefedrina',            C.GRIPE,      26.9, false, 56],
  ['m236','Apracur',                           '20 comprimidos',     'Paracetamol + clorfeniramina + cafeína',  C.GRIPE,      13.9, false, 46],
  ['m237','Bisolvon Xarope 8mg/5ml',           'Frasco 120 ml',      'Bromexina',                               C.GRIPE,      29.9, false, 44],
  ['m238','Fluimucil 600mg',                   '16 comprimidos efervescentes','Acetilcisteína',                 C.GRIPE,      39.9, false, 48],
  ['m239','Berotec Gotas 5mg/ml',              'Frasco 20 ml',       'Bromidrato de fenoterol',                 C.GRIPE,      19.9, true,  42],
  ['m240','Clenil HFA 250mcg',                 'Spray 200 doses',    'Dipropionato de beclometasona',           C.GRIPE,      44.9, true,  40],
  ['m241','Symbicort 6/200mcg',                'Inalador 60 doses',  'Budesonida + formoterol',                 C.GRIPE,     119.9, true,  38],
  ['m199','Rinosoro Jet',                      'Frasco 50 ml',       'Cloreto de sódio',                        C.GRIPE,      18.9, false, 50],

  // Vitaminas
  ['m243','Vitamina D3 7.000UI',               '30 cápsulas',        'Colecalciferol',                          C.VITAMINAS,  34.9, false, 48],
  ['m244','Cálcio + Vitamina D3 600mg',        '60 comprimidos',     'Carbonato de cálcio + colecalciferol',    C.VITAMINAS,  39.9, false, 44],
  ['m245','Vitamina E 400UI',                  '30 cápsulas',        'Acetato de tocoferol',                    C.VITAMINAS,  27.9, false, 32],
  ['m246','Zinco Quelato 30mg',                '60 cápsulas',        'Zinco quelato',                           C.VITAMINAS,  24.9, false, 38],
  ['m247','Colágeno Hidrolisado Verisol',      '30 sachês',          'Peptídeos de colágeno',                   C.VITAMINAS,  89.9, false, 42],
  ['m248','Biotina 10mg',                      '60 cápsulas',        'Biotina',                                 C.VITAMINAS,  29.9, false, 36],
  ['m249','Centrum A-Z',                       '60 comprimidos',     'Polivitamínico e minerais',               C.VITAMINAS,  69.9, false, 46],
  ['m250','Ferro Quelato 30mg',                '60 cápsulas',        'Ferro quelato',                           C.VITAMINAS,  26.9, false, 34],
  ['m251','Magnésio Quelato 500mg',            '60 cápsulas',        'Magnésio quelato',                        C.VITAMINAS,  32.9, false, 40],
  ['m252','Vitamina C 500mg',                  '60 comprimidos',     'Ácido ascórbico',                         C.VITAMINAS,  19.9, false, 52],

  // Pele e cabelo
  ['m253','Bepantol Baby Pomada',              'Bisnaga 60 g',       'Dexpantenol',                             C.PELE,       44.9, false, 54],
  ['m254','Cicatricure Gel',                   'Bisnaga 30 g',       'Extrato de cepalin + alantoína',          C.PELE,       59.9, false, 40],
  ['m255','Nistatina Creme 100.000UI/g',       'Bisnaga 60 g',       'Nistatina',                               C.PELE,       22.9, true,  36],
  ['m256','Clotrimazol Creme 10mg/g',          'Bisnaga 20 g',       'Clotrimazol',                             C.PELE,       14.9, false, 42],
  ['m257','Terbinafina 250mg',                 '14 comprimidos',     'Cloridrato de terbinafina',               C.PELE,       34.9, true,  38],
  ['m258','Cetoconazol Xampu 20mg/g',          'Frasco 100 ml',      'Cetoconazol',                             C.PELE,       29.9, false, 46],
  ['m259','Protetor Solar FPS 50',             'Frasco 120 ml',      'Filtro solar',                            C.PELE,       54.9, false, 50],
  ['m260','Loção Hidratante Ureia 10%',        'Frasco 200 ml',      'Ureia',                                   C.PELE,       34.9, false, 38],
  ['m261','Permetrina Loção 50mg/ml',          'Frasco 60 ml',       'Permetrina',                              C.PELE,       19.9, false, 32],
  ['m262','Ivermectina 6mg',                   '4 comprimidos',      'Ivermectina',                             C.PELE,       16.9, true,  44],
  ['m264','Minoxidil 5% Espuma',               'Frasco 60 g',        'Minoxidil',                               C.PELE,       89.9, false, 40],

  // Saúde mental e sono
  ['m265','Paroxetina 20mg',                   '30 comprimidos',     'Cloridrato de paroxetina',                C.MENTAL,     24.9, true,  40],
  ['m266','Citalopram 20mg',                   '30 comprimidos',     'Bromidrato de citalopram',                C.MENTAL,     22.9, true,  34],
  ['m267','Duloxetina 60mg',                   '30 cápsulas',        'Cloridrato de duloxetina',                C.MENTAL,     59.9, true,  36],
  ['m268','Desvenlafaxina 50mg',               '30 comprimidos',     'Succinato de desvenlafaxina',             C.MENTAL,     69.9, true,  34],
  ['m269','Trazodona 50mg',                    '30 comprimidos',     'Cloridrato de trazodona',                 C.MENTAL,     32.9, true,  32],
  ['m270','Risperidona 2mg',                   '30 comprimidos',     'Risperidona',                             C.MENTAL,     26.9, true,  30],
  ['m271','Carbonato de Lítio 300mg',          '50 comprimidos',     'Carbonato de lítio',                      C.MENTAL,     19.9, true,  28],
  ['m272','Valeriana 300mg',                   '30 cápsulas',        'Extrato de valeriana',                    C.MENTAL,     29.9, false, 42],
  ['m273','Passiflora 260mg',                  '30 comprimidos',     'Extrato de passiflora',                   C.MENTAL,     24.9, false, 40],

  // Tireoide
  ['m274','Levotiroxina 25mcg',                '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   11.9, true,  40],
  ['m275','Levotiroxina 100mcg',               '30 comprimidos',     'Levotiroxina sódica',                     C.TIREOIDE,   14.9, true,  42],
  ['m276','Tapazol 10mg',                      '20 comprimidos',     'Metimazol',                               C.TIREOIDE,   19.9, true,  30],
  ['m277','Propiltiouracila 100mg',            '20 comprimidos',     'Propiltiouracila',                        C.TIREOIDE,   22.9, true,  26],

  // Saúde da mulher
  ['m278','Diane 35',                          '21 comprimidos',     'Ciproterona + etinilestradiol',           C.MULHER,     34.9, true,  42],
  ['m279','Elani Ciclo',                       '21 comprimidos',     'Drospirenona + etinilestradiol',          C.MULHER,     39.9, true,  40],
  ['m280','Cerazette',                         '28 comprimidos',     'Desogestrel',                             C.MULHER,     59.9, true,  38],
  ['m281','Miconazol Creme Vaginal 20mg/g',    'Bisnaga 80 g',       'Nitrato de miconazol',                    C.MULHER,     29.9, false, 44],
  ['m282','Clotrimazol Creme Vaginal 10mg/g',  'Bisnaga 50 g',       'Clotrimazol',                             C.MULHER,     24.9, false, 36],
  ['m283','Teste de Ovulação',                 '5 unidades',         'Teste rápido de LH',                      C.MULHER,     39.9, false, 32],
  ['m285','Ácido Fólico 400mcg',               '60 comprimidos',     'Ácido fólico',                            C.MULHER,     19.9, false, 40],
  ['m286','Progesterona Micronizada 200mg',    '14 cápsulas',        'Progesterona micronizada',                C.MULHER,     49.9, true,  30],
  ['m287','Estradiol Gel 0,6mg/g',             'Frasco 80 g',        'Estradiol',                               C.MULHER,     59.9, true,  28],

  // Olhos
  ['m288','Lacribell Colírio',                 'Frasco 10 ml',       'Carmelose sódica',                        C.OLHOS,      22.9, false, 40],
  ['m289','Colírio Lerin',                     'Frasco 10 ml',       'Nafazolina + feniramina',                 C.OLHOS,      14.9, false, 38],
  ['m290','Ciprofloxacino Colírio 3,5mg/ml',   'Frasco 5 ml',        'Ciprofloxacino',                          C.OLHOS,      19.9, true,  34],
  ['m291','Dexafenicol Colírio',               'Frasco 5 ml',        'Dexametasona + cloranfenicol',            C.OLHOS,      24.9, true,  30],
  ['m292','Soro para Lentes de Contato',       'Frasco 310 ml',      'Solução salina estéril',                  C.OLHOS,      29.9, false, 36],

  // Infantil
  ['m293','Paracetamol Bebê Gotas 100mg/ml',   'Frasco 15 ml',       'Paracetamol',                             C.INFANTIL,   12.9, false, 62],
  ['m294','Tylenol Bebê Gotas 100mg/ml',       'Frasco 15 ml',       'Paracetamol',                             C.INFANTIL,   24.9, false, 58],
  ['m295','Ibuprofeno Gotas Infantil 50mg/ml', 'Frasco 30 ml',       'Ibuprofeno',                              C.INFANTIL,   18.9, false, 56],
  ['m296','Dipirona Gotas Infantil 500mg/ml',  'Frasco 10 ml',       'Dipirona sódica',                         C.INFANTIL,   11.9, false, 54],
  ['m297','Vitamina D Infantil Gotas',         'Frasco 20 ml',       'Colecalciferol',                          C.INFANTIL,   39.9, false, 50],
  ['m298','Soro Nasal Infantil 0,9%',          'Frasco 100 ml',      'Cloreto de sódio',                        C.INFANTIL,    9.9, false, 52],
  ['m299','Pomada para Assadura',              'Bisnaga 45 g',       'Óxido de zinco',                          C.INFANTIL,   24.9, false, 48],
  ['m300','Amoxicilina Infantil 400mg/5ml',    'Frasco 70 ml',       'Amoxicilina',                             C.INFANTIL,   32.9, true,  44],
  ['m301','Xarope Infantil para Tosse',        'Frasco 100 ml',      'Guaifenesina',                            C.INFANTIL,   22.9, false, 42],
  ['m302','Multivitamínico Infantil Gotas',    'Frasco 20 ml',       'Polivitamínico',                          C.INFANTIL,   34.9, false, 40],
  ['m303','Sabonete Líquido Infantil',         'Frasco 200 ml',      'Sabonete suave',                          C.INFANTIL,   19.9, false, 34],
  ['m304','Fralda Descartável Tamanho M',      '30 unidades',        'Fralda descartável',                      C.INFANTIL,   39.9, false, 44],

  // Saúde do homem
  ['m305','Tadalafila 20mg',                   '4 comprimidos',      'Tadalafila',                              C.HOMEM,      34.9, true,  46],
  ['m306','Sildenafila 50mg',                  '4 comprimidos',      'Citrato de sildenafila',                  C.HOMEM,      29.9, true,  48],
  ['m263','Finasterida 1mg',                   '30 comprimidos',     'Finasterida',                             C.HOMEM,      39.9, true,  42],
  ['m307','Finasterida 5mg',                   '30 comprimidos',     'Finasterida',                             C.HOMEM,      29.9, true,  36],
  ['m308','Tansulosina 0,4mg',                 '30 cápsulas',        'Cloridrato de tansulosina',               C.HOMEM,      39.9, true,  34],
  ['m309','Dutasterida 0,5mg',                 '30 cápsulas',        'Dutasterida',                             C.HOMEM,      59.9, true,  30],
  ['m310','Testosterona Gel 50mg',             '30 sachês',          'Testosterona',                            C.HOMEM,      99.9, true,  26],
  ['m311','Preservativo Masculino',            '12 unidades',        'Látex natural',                           C.HOMEM,      24.9, false, 50],
  ['m312','Minoxidil Barba 5%',                'Frasco 60 ml',       'Minoxidil',                               C.HOMEM,      69.9, false, 38],

  // Cuidados e curativos
  ['m313','Álcool em Gel 70%',                 'Frasco 500 ml',      'Álcool etílico 70%',                      C.CUIDADOS,   14.9, false, 54],
  ['m314','Álcool 70% Líquido',                'Frasco 1 L',         'Álcool etílico 70%',                      C.CUIDADOS,   12.9, false, 48],
  ['m315','Água Oxigenada 10 volumes',         'Frasco 100 ml',      'Peróxido de hidrogênio',                  C.CUIDADOS,    6.9, false, 42],
  ['m316','Curativo Adesivo Band-Aid',         '40 unidades',        'Curativo adesivo',                        C.CUIDADOS,   19.9, false, 52],
  ['m317','Gaze Estéril 7,5x7,5cm',            '10 pacotes',         'Gaze de algodão',                         C.CUIDADOS,   14.9, false, 40],
  ['m318','Esparadrapo 10m',                   '1 rolo',             'Fita adesiva hospitalar',                 C.CUIDADOS,   12.9, false, 36],
  ['m319','Algodão Hidrófilo 50g',             '1 pacote',           'Algodão hidrófilo',                       C.CUIDADOS,    8.9, false, 38],
  ['m320','Termômetro Digital',                '1 unidade',          'Termômetro clínico',                      C.CUIDADOS,   29.9, false, 50],
  ['m321','Medidor de Pressão Digital',        '1 unidade',          'Esfigmomanômetro automático',             C.CUIDADOS,  179.9, false, 44],
  ['m322','Máscara Descartável Tripla',        '50 unidades',        'Máscara cirúrgica',                       C.CUIDADOS,   24.9, false, 40],
  ['m323','Luvas de Procedimento',             '100 unidades',       'Luva descartável',                        C.CUIDADOS,   39.9, false, 34],
  ['m324','Bolsa Térmica Quente e Fria',       '1 unidade',          'Compressa de gel',                        C.CUIDADOS,   24.9, false, 38],
  ['m325','Repelente Icaridina',               'Frasco 100 ml',      'Icaridina',                               C.CUIDADOS,   34.9, false, 46],
  ['m326','Teste de Covid-19 Antígeno',        '1 unidade',          'Teste rápido de antígeno',                C.CUIDADOS,   29.9, false, 36],
];

// Preços originais dos primeiros remédios (mantidos iguais à versão anterior).
const FIXED_PRICES = {
  m1: { p1: 9.90,  p2: 14.50, p3: 11.20, p4: 18.00, p5: 10.40, p6: 13.30 },
  m2: { p1: 7.50,  p2: 8.90,  p3: 12.00, p4: 7.10,  p5: 9.90,  p6: 6.80 },
  m3: { p1: 22.00, p2: 19.90, p3: 31.50, p4: 24.00, p5: 18.40, p6: 20.10 },
  m4: { p1: 15.90, p2: 12.40, p3: 29.90, p4: 14.00, p5: 13.20, p6: 16.70 },
  m5: { p1: 11.30, p2: 9.80,  p3: 17.60, p4: 10.90, p5: 8.70,  p6: 12.10 },
  m6: { p1: 13.40, p2: 11.90, p3: 19.00, p4: 12.30, p5: 14.60, p6: 10.50 },
  m7: { p1: 8.20,  p2: 7.40,  p3: 13.90, p4: 9.10,  p5: 6.90,  p6: 8.60 },
  m8: { p1: 16.50, p2: 21.90, p3: 14.20, p4: 19.00, p5: 15.80, p6: 17.30 },
};

// Variação determinística (sempre o mesmo preço a cada inicialização): -14% a +18%.
function variation(medId, pharmId) {
  let h = 2166136261;
  for (const ch of medId + ':' + pharmId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return 0.86 + (h % 1000) / 1000 * 0.32;
}

function priceFor(med, pharmacy) {
  const [id, , , , , base] = med;
  if (FIXED_PRICES[id]) return FIXED_PRICES[id][pharmacy.id];
  const raw = base * pharmacy.priceBias * variation(id, pharmacy.id);
  const cents = Math.round(raw * 10) * 10 - 1; // termina em ,x9
  return Math.max(199, cents) / 100;
}

// Cada 1 ponto vale R$0,05; recompensas maiores rendem um pouco mais por ponto.
const REWARDS = [
  { id: 'r1', name: 'R$5 de desconto',  desc: 'Em qualquer compra',            cost: 100, amount: 5,  minOrder: 0 },
  { id: 'r2', name: 'R$10 de desconto', desc: 'Em qualquer compra',            cost: 200, amount: 10, minOrder: 0 },
  { id: 'r3', name: 'R$20 de desconto', desc: 'Em compras a partir de R$80',   cost: 380, amount: 20, minOrder: 80 },
  { id: 'r4', name: 'R$40 de desconto', desc: 'Em compras a partir de R$150',  cost: 720, amount: 40, minOrder: 150 },
];

module.exports = { PHARMACIES, MEDICINES, REWARDS, priceFor };
