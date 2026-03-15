import React, { useState, useMemo } from 'react';

const App = () => {
  const [jsonInput, setJsonInput] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [metaResults, setMetaResults] = useState('');
  const [extractedData, setExtractedData] = useState([]);
  const [enrichedData, setEnrichedData] = useState([]);
  const [activeStep, setActiveStep] = useState(1);
  const [error, setError] = useState('');

  // Extract data from OctaDesk JSON
  const extractFromOctaDesk = (jsonStr) => {
    try {
      setError('');
      const parsed = JSON.parse(jsonStr);
      
      // Handle both single object and array
      const items = Array.isArray(parsed) ? parsed : [parsed];
      
      const extracted = items.map((item, index) => {
        // Navigate to the referral data
        const customFields = item.customFields || [];
        const octabsp = customFields.find(cf => cf.id === 'octabsp') || {};
        const integrator = octabsp.integrator || {};
        const messages = integrator.customFields?.messages || [];
        const firstMessage = messages[0] || {};
        const referral = firstMessage.referral || {};
        
        // Extract contact info
        const contact = item.contact || {};
        
        return {
          id: index + 1,
          contactName: contact.name || 'N/A',
          contactPhone: integrator.from?.number || 'N/A',
          conversationId: item.id || 'N/A',
          createdAt: item.createdAt || 'N/A',
          sourceId: referral.source_id || 'N/A',
          sourceType: referral.source_type || 'N/A',
          sourceUrl: referral.source_url || 'N/A',
          ctwaClid: referral.ctwa_clid || 'N/A',
          headline: referral.headline || 'N/A',
          adBody: referral.body || 'N/A',
          imageUrl: referral.image_url || '',
          // These will be filled from Meta API
          adName: '',
          campaignId: '',
          campaignName: '',
          adsetId: '',
          adsetName: ''
        };
      }).filter(item => item.sourceId !== 'N/A');

      if (extracted.length === 0) {
        setError('Nenhum dado de atribuição encontrado no JSON. Verifique se o payload contém dados de CTWA.');
        return;
      }

      setExtractedData(extracted);
      setActiveStep(2);
    } catch (e) {
      setError('JSON inválido. Verifique o formato e tente novamente.');
    }
  };

  // Generate curl commands
  const curlCommands = useMemo(() => {
    if (extractedData.length === 0) return '';
    
    const uniqueSourceIds = [...new Set(extractedData.map(d => d.sourceId))];
    const token = accessToken || 'SEU_ACCESS_TOKEN';
    
    return uniqueSourceIds.map(sourceId => 
      `curl -G "https://graph.facebook.com/v19.0/${sourceId}" -d "fields=name,campaign{id,name},adset{id,name}" -d "access_token=${token}"`
    ).join('\n\n');
  }, [extractedData, accessToken]);

  // Python script alternative
  const pythonScript = useMemo(() => {
    if (extractedData.length === 0) return '';
    
    const uniqueSourceIds = [...new Set(extractedData.map(d => d.sourceId))];
    const token = accessToken || 'SEU_ACCESS_TOKEN';
    
    return `import requests
import json
import time

ACCESS_TOKEN = "${token}"
SOURCE_IDS = ${JSON.stringify(uniqueSourceIds, null, 2)}

results = []

for source_id in SOURCE_IDS:
    url = f"https://graph.facebook.com/v19.0/{source_id}"
    params = {
        "fields": "name,campaign{id,name},adset{id,name}",
        "access_token": ACCESS_TOKEN
    }
    
    response = requests.get(url, params=params)
    data = response.json()
    results.append(data)
    print(json.dumps(data, indent=2))
    time.sleep(0.3)  # Rate limiting

# Print all results as JSON array
print("\\n\\n=== RESULTADOS COMPLETOS ===")
print(json.dumps(results, indent=2))
`;
  }, [extractedData, accessToken]);

  // Parse Meta API results
  const parseMetaResults = (resultsStr) => {
    try {
      setError('');
      
      // Try to parse as JSON array or individual objects
      let results;
      try {
        results = JSON.parse(resultsStr);
        if (!Array.isArray(results)) results = [results];
      } catch {
        // Try to extract multiple JSON objects
        const jsonRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
        const matches = resultsStr.match(jsonRegex);
        if (matches) {
          results = matches.map(m => {
            try { return JSON.parse(m); } catch { return null; }
          }).filter(Boolean);
        } else {
          throw new Error('Não foi possível extrair JSON dos resultados');
        }
      }

      // Create a map of source_id -> meta data
      const metaMap = {};
      results.forEach(result => {
        if (result.id) {
          metaMap[result.id] = {
            adName: result.name || '',
            campaignId: result.campaign?.id || '',
            campaignName: result.campaign?.name || '',
            adsetId: result.adset?.id || '',
            adsetName: result.adset?.name || ''
          };
        }
      });

      // Enrich extracted data
      const enriched = extractedData.map(item => ({
        ...item,
        ...(metaMap[item.sourceId] || {})
      }));

      setEnrichedData(enriched);
      setActiveStep(4);
    } catch (e) {
      setError('Erro ao processar resultados da API. Verifique o formato.');
    }
  };

  // Export to TSV (Google Sheets friendly)
  const exportToSheets = () => {
    const data = enrichedData.length > 0 ? enrichedData : extractedData;
    
    const headers = [
      'Imagem URL',
      'Contato',
      'Telefone',
      'Data',
      'Campanha',
      'Ad Set',
      'Anúncio',
      'Source ID',
      'CTWA Click ID',
      'Headline'
    ];

    const rows = data.map(item => [
      item.imageUrl || '',
      item.contactName,
      item.contactPhone,
      item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '',
      item.campaignName || '(consultar API)',
      item.adsetName || '(consultar API)',
      item.adName || '(consultar API)',
      item.sourceId,
      item.ctwaClid,
      item.headline
    ]);

    const tsv = [headers, ...rows].map(row => row.join('\t')).join('\n');
    
    const blob = new Blob([tsv], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atribuicao_ctwa_${new Date().toISOString().split('T')[0]}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">CTWA Attribution</h1>
          <p className="text-gray-500 mt-1">Extraia dados de atribuição do OctaDesk e enriqueça com a API do Meta</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {[1, 2, 3, 4].map((step) => (
            <React.Fragment key={step}>
              <button
                onClick={() => step <= activeStep && setActiveStep(step)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  step === activeStep
                    ? 'bg-gray-900 text-white'
                    : step < activeStep
                    ? 'bg-gray-300 text-gray-700 cursor-pointer hover:bg-gray-400'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {step}
              </button>
              {step < 4 && <div className={`w-12 h-px ${step < activeStep ? 'bg-gray-400' : 'bg-gray-200'}`} />}
            </React.Fragment>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: JSON Input */}
        {activeStep === 1 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-medium text-gray-900 mb-1">1. Importe o JSON do OctaDesk</h2>
            <p className="text-sm text-gray-500 mb-4">Faça upload do arquivo ou cole o conteúdo</p>
            
            {/* File upload area */}
            <div 
              className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center mb-4 hover:border-gray-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('file-input').click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-gray-400', 'bg-gray-50');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-gray-400', 'bg-gray-50');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-gray-400', 'bg-gray-50');
                const file = e.dataTransfer.files[0];
                if (file && file.type === 'application/json') {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setJsonInput(event.target.result);
                  };
                  reader.readAsText(file);
                } else {
                  setError('Por favor, envie um arquivo .json');
                }
              }}
            >
              <input
                id="file-input"
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setJsonInput(event.target.result);
                    };
                    reader.readAsText(file);
                  }
                }}
              />
              <div className="text-gray-400 mb-2">
                <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm text-gray-600">Arraste o arquivo .json aqui ou clique para selecionar</p>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="text-sm text-gray-400">ou cole o conteúdo</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>
            
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"id": "...", "customFields": [...], ...}'
              className="w-full h-48 p-4 border border-gray-200 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            
            <button
              onClick={() => extractFromOctaDesk(jsonInput)}
              disabled={!jsonInput.trim()}
              className="mt-4 px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
            >
              Extrair dados
            </button>
          </div>
        )}

        {/* Step 2: Show extracted data & generate commands */}
        {activeStep === 2 && (
          <div className="space-y-6">
            {/* Extracted summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-medium text-gray-900 mb-4">2. Dados extraídos</h2>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-600">Criativo</th>
                      <th className="text-left py-2 font-medium text-gray-600">Contato</th>
                      <th className="text-left py-2 font-medium text-gray-600">Data</th>
                      <th className="text-left py-2 font-medium text-gray-600">Headline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2">
                          {item.imageUrl ? (
                            <div className="relative">
                              <img 
                                src={item.imageUrl} 
                                alt="Criativo" 
                                className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                              <a
                                href={item.sourceUrl || item.imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'none' }}
                                className="w-16 h-16 bg-gray-100 rounded-lg flex-col items-center justify-center text-gray-400 text-xs hover:bg-gray-200 transition-colors cursor-pointer"
                              >
                                <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                <span>Ver</span>
                              </a>
                            </div>
                          ) : (
                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                              Sem img
                            </div>
                          )}
                        </td>
                        <td className="py-2 text-gray-900">{item.contactName}</td>
                        <td className="py-2 text-gray-500">
                          {new Date(item.createdAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2 text-gray-500 max-w-64">{item.headline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  Consultar API do Meta
                </button>
                <button
                  onClick={exportToSheets}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Exportar parcial
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: API commands */}
        {activeStep === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-medium text-gray-900 mb-1">3. Consulte a API do Meta</h2>
              <p className="text-sm text-gray-500 mb-4">Cole seu access token e rode os comandos no terminal</p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token (opcional)</label>
                <input
                  type="text"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full p-3 border border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>

              {/* Tabs for curl vs Python */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <button className="px-4 py-2 text-sm font-medium text-gray-900 bg-white border-b-2 border-gray-900">
                    cURL
                  </button>
                </div>
                <div className="p-4 bg-gray-900 rounded-b-lg">
                  <pre className="text-gray-100 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                    {curlCommands}
                  </pre>
                </div>
                <button
                  onClick={() => copyToClipboard(curlCommands)}
                  className="w-full py-2 text-sm text-gray-600 hover:bg-gray-50 border-t border-gray-200"
                >
                  Copiar comandos
                </button>
              </div>

              <details className="mt-4">
                <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                  Alternativa: Script Python
                </summary>
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-4 bg-gray-900">
                    <pre className="text-gray-100 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
                      {pythonScript}
                    </pre>
                  </div>
                  <button
                    onClick={() => copyToClipboard(pythonScript)}
                    className="w-full py-2 text-sm text-gray-600 hover:bg-gray-50 border-t border-gray-200"
                  >
                    Copiar script
                  </button>
                </div>
              </details>
            </div>

            {/* Paste results */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="font-medium text-gray-900 mb-1">Cole os resultados da API</h2>
              <p className="text-sm text-gray-500 mb-4">JSON retornado pela API do Meta</p>

              <textarea
                value={metaResults}
                onChange={(e) => setMetaResults(e.target.value)}
                placeholder='[{"id": "120238822954820645", "name": "...", "campaign": {...}}]'
                className="w-full h-48 p-4 border border-gray-200 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-200"
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => parseMetaResults(metaResults)}
                  disabled={!metaResults.trim()}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-gray-800 transition-colors"
                >
                  Processar resultados
                </button>
                <button
                  onClick={() => {
                    setEnrichedData(extractedData);
                    setActiveStep(4);
                  }}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Pular (sem enriquecer)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Final results */}
        {activeStep === 4 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-medium text-gray-900">4. Dados consolidados</h2>
                <p className="text-sm text-gray-500">{enrichedData.length} registro(s) prontos para exportar</p>
              </div>
              <button
                onClick={exportToSheets}
                className="px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Exportar para Google Sheets
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-medium text-gray-600">Criativo</th>
                    <th className="text-left py-2 font-medium text-gray-600">Contato</th>
                    <th className="text-left py-2 font-medium text-gray-600">Data</th>
                    <th className="text-left py-2 font-medium text-gray-600">Campanha</th>
                    <th className="text-left py-2 font-medium text-gray-600">Ad Set</th>
                    <th className="text-left py-2 font-medium text-gray-600">Anúncio</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedData.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2">
                        {item.imageUrl ? (
                          <div className="relative">
                            <img 
                              src={item.imageUrl} 
                              alt="Criativo" 
                              className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <a
                              href={item.sourceUrl || item.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'none' }}
                              className="w-16 h-16 bg-gray-100 rounded-lg flex-col items-center justify-center text-gray-400 text-xs hover:bg-gray-200 transition-colors cursor-pointer"
                            >
                              <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span>Ver</span>
                            </a>
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                            Sem img
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-gray-900">{item.contactName}</td>
                      <td className="py-2 text-gray-500">
                        {new Date(item.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 text-gray-900">{item.campaignName || '-'}</td>
                      <td className="py-2 text-gray-500">{item.adsetName || '-'}</td>
                      <td className="py-2 text-gray-500">{item.adName || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => {
                setActiveStep(1);
                setJsonInput('');
                setExtractedData([]);
                setEnrichedData([]);
                setMetaResults('');
                setError('');
              }}
              className="mt-6 text-sm text-gray-500 hover:text-gray-900"
            >
              ← Processar novos dados
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
