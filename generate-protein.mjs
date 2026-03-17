#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, 'output');

const CONSERVED_RESIDUE_COLOR = '#9ccc3c';
const DEFAULT_TRACK_COLOR = '#7f8c8d';
const LIBRARY_ALIASES = {
  PFAM: 'Pfam',
  GENE3D: 'CATH-Gene3D',
};
const LIBRARY_COLORS = {
  Pfam: '#1f77b4',
  'CATH-Gene3D': '#ff7f0e',
  PANTHER: '#2ca02c',
  SUPERFAMILY: '#d62728',
  CDD: '#9467bd',
  SMART: '#8c564b',
  HAMAP: '#e377c2',
  NCBIFAM: '#bcbd22',
  'MobiDB-lite': '#17becf',
  'PROSITE profiles': '#7f7f7f',
  'PROSITE patterns': '#bdbdbd',
  COILS: '#4c78a8',
  PHOBIUS: '#5d6d7e',
  PRINTS: '#8a89a6',
  PIRSR: '#bc80bd',
  PIRSF: '#fb8072',
  'CATH-FunFam': '#80b1d3',
  SIGNALP_EUK: '#6f4e7c',
};
const SECTION_CONFIG = [
  { key: 'family', label: 'Families', representativeLabel: 'Representative families' },
  { key: 'domain', label: 'Domains', representativeLabel: 'Representative domains' },
  {
    key: 'region',
    label: 'Coiled-Coils, Signal Peptides and Transmembrane Regions',
    representativeLabel: 'Representative regions',
  },
];

function normalizeLibraryName(library) {
  if (!library) {
    return 'Unknown';
  }
  return LIBRARY_ALIASES[library] || library;
}

function normalizeSignatureType(signatureType) {
  return String(signatureType || 'Unknown')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

function getColorForLibrary(library) {
  return LIBRARY_COLORS[library] || DEFAULT_TRACK_COLOR;
}

function getShapeForType(signatureType, signatureText = '') {
  const type = normalizeSignatureType(signatureType);
  const text = String(signatureText).toLowerCase();

  if (type === 'domain' || type === 'family' || type === 'homologous_superfamily' || type === 'active_site') {
    return 'roundRectangle';
  }

  if (type === 'signal_peptide' || text.includes('signal peptide')) {
    return 'diamond';
  }

  if (type === 'disulphide') {
    return 'bridge';
  }

  if (
    type === 'repeat' ||
    type === 'region' ||
    type === 'motif' ||
    type === 'conserved_site' ||
    type === 'ptm' ||
    text.includes('transmembrane')
  ) {
    return 'rectangle';
  }

  return 'roundRectangle';
}

function getSectionForFeature(signatureType, signatureText = '') {
  const type = normalizeSignatureType(signatureType);
  const text = String(signatureText).toLowerCase();

  if (type === 'family') {
    return 'family';
  }

  const regionSignalHints = [
    'signal peptide',
    'transmembrane',
    'membrane',
    'coiled',
    'coil',
    'cytoplasmic',
    'non_cytoplasmic',
    'n_region',
    'h_region',
    'c_region',
    'holin',
  ];
  const looksLikeRegion = regionSignalHints.some((hint) => text.includes(hint));
  if (type === 'region' || type === 'signal_peptide' || type === 'disulphide' || looksLikeRegion) {
    return 'region';
  }

  return 'domain';
}

function sectionLabel(sectionKey) {
  const section = SECTION_CONFIG.find((item) => item.key === sectionKey);
  return section ? section.label : 'Domains';
}

function toValidPosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.max(1, Math.round(number));
}

function compareByPosition(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  return String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''));
}

function getLocationFragments(location) {
  if (!location || typeof location !== 'object') {
    return [];
  }

  const fragments = location['location-fragments'];
  if (Array.isArray(fragments) && fragments.length > 0) {
    return fragments;
  }

  if (location.start != null && location.end != null) {
    return [{ start: location.start, end: location.end, 'dc-status': 'CONTINUOUS' }];
  }

  return [];
}

function getSignatureDisplayName(signature) {
  if (!signature || typeof signature !== 'object') {
    return 'Unknown';
  }

  return signature.entry?.name || signature.name || signature.accession || 'Unknown';
}

function getInterproLabel(item) {
  if (item.integrated) {
    const accession = item.entryAccession || item.entry_accession || 'Integrated';
    return `Integrated (${accession})`;
  }
  return 'Unintegrated';
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildRepresentativeSummary(features) {
  const unique = new Map();
  for (const feature of features) {
    const key = `${feature.library}||${feature.accession}||${feature.start}||${feature.end}`;
    if (unique.has(key)) {
      continue;
    }
    unique.set(key, {
      name: feature.name,
      library: feature.library,
      accession: feature.accession,
      color: feature.color,
      start: feature.start,
      end: feature.end,
      type: feature.type,
      integrated: feature.integrated,
      entryAccession: feature.entryAccession,
      entryName: feature.entryName,
    });
  }
  return [...unique.values()].sort(compareByPosition);
}

function buildRegionPredictorSummary(features) {
  const unique = new Map();
  for (const feature of features) {
    const key = `${feature.library}||${feature.accession}`;
    if (unique.has(key)) {
      continue;
    }
    unique.set(key, {
      name: feature.name,
      library: feature.library,
      accession: feature.accession,
      color: feature.color,
      integrated: feature.integrated,
      entryAccession: feature.entryAccession,
      entryName: feature.entryName,
      type: feature.type,
    });
  }
  return [...unique.values()].sort((a, b) => a.library.localeCompare(b.library));
}

function buildIntegrationSummary(features) {
  const integrated = new Set();
  const unintegrated = new Set();
  for (const feature of features) {
    const key = `${feature.library}||${feature.accession}`;
    if (feature.integrated) {
      integrated.add(key);
    } else {
      unintegrated.add(key);
    }
  }
  return {
    integrated: integrated.size,
    unintegrated: unintegrated.size,
  };
}

function buildSectionTracks(domainFeatures) {
  const sectionTracks = [];

  for (const section of SECTION_CONFIG) {
    const sectionFeatures = domainFeatures.filter((feature) => feature.section === section.key).sort(compareByPosition);
    if (sectionFeatures.length === 0) {
      continue;
    }

    const representativeFeatures = sectionFeatures.filter((feature) => feature.representative).sort(compareByPosition);
    const libraries = [...new Set(sectionFeatures.map((feature) => feature.library))].sort();
    const libraryTracks = libraries.map((library) => ({
      label: library,
      features: sectionFeatures.filter((feature) => feature.library === library).sort(compareByPosition),
    }));

    sectionTracks.push({
      key: section.key,
      label: section.label,
      representativeLabel: section.representativeLabel,
      representativeFeatures,
      libraryTracks,
      totalFeatures: sectionFeatures.length,
    });
  }

  return sectionTracks;
}

function extractAnnotations(matches) {
  const domains = [];
  const residues = [];
  const conservedSources = [];

  let domainIndex = 0;
  let residueIndex = 0;
  let conservedSourceIndex = 0;

  for (const match of matches || []) {
    const signature = match?.signature || {};
    const library = normalizeLibraryName(signature.signatureLibraryRelease?.library || match?.source || 'Unknown');
    const name = getSignatureDisplayName(signature);
    const description = signature.entry?.description || signature.description || '';
    const accession = signature.accession || match?.['model-ac'] || 'Unknown';
    const signatureType = signature.type || 'Unknown';
    const normalizedType = normalizeSignatureType(signatureType);
    const combinedText = `${name} ${description} ${accession} ${library}`;
    const shape = getShapeForType(signatureType, combinedText);
    const section = getSectionForFeature(signatureType, combinedText);
    const color = getColorForLibrary(library);
    const integrated = Boolean(signature.entry?.accession);
    const entryAccession = signature.entry?.accession || null;
    const entryName = signature.entry?.name || null;
    const entryType = signature.entry?.type || null;

    for (const location of match?.locations || []) {
      const representative = Boolean(location.representative);
      const fragments = getLocationFragments(location);

      for (const fragment of fragments) {
        const start = toValidPosition(fragment.start);
        const end = toValidPosition(fragment.end);
        if (!start || !end) {
          continue;
        }

        const normalizedStart = Math.min(start, end);
        const normalizedEnd = Math.max(start, end);

        domains.push({
          id: `domain-${domainIndex++}`,
          accession,
          name,
          library,
          description,
          start: normalizedStart,
          end: normalizedEnd,
          length: normalizedEnd - normalizedStart + 1,
          type: signatureType,
          normalizedType,
          shape,
          color,
          section,
          representative,
          integrated,
          entryAccession,
          entryName,
          entryType,
        });
      }

      const locationSites = location?.sites || [];
      if (locationSites.length > 0) {
        const totalSiteCount = locationSites.reduce(
          (sum, site) => sum + ((site?.siteLocations || []).length || 0),
          0,
        );

        for (const fragment of fragments) {
          const start = toValidPosition(fragment.start);
          const end = toValidPosition(fragment.end);
          if (!start || !end) {
            continue;
          }
          const normalizedStart = Math.min(start, end);
          const normalizedEnd = Math.max(start, end);

          conservedSources.push({
            id: `conserved-source-${conservedSourceIndex++}`,
            accession,
            name,
            library,
            start: normalizedStart,
            end: normalizedEnd,
            length: normalizedEnd - normalizedStart + 1,
            siteCount: totalSiteCount,
            color: CONSERVED_RESIDUE_COLOR,
            integrated,
            entryAccession,
            entryName,
            entryType,
            representative,
          });
        }
      }

      for (const site of locationSites) {
        const siteDescription = site?.description || 'Conserved residue';

        for (const siteLocation of site?.siteLocations || []) {
          const start = toValidPosition(siteLocation.start);
          const end = toValidPosition(siteLocation.end ?? siteLocation.start);
          if (!start || !end) {
            continue;
          }

          const normalizedStart = Math.min(start, end);
          const normalizedEnd = Math.max(start, end);

          residues.push({
            id: `residue-${residueIndex++}`,
            accession,
            sourceName: name,
            library,
            siteDescription,
            residue: siteLocation.residue || '',
            start: normalizedStart,
            end: normalizedEnd,
            length: normalizedEnd - normalizedStart + 1,
            color: CONSERVED_RESIDUE_COLOR,
            integrated,
            entryAccession,
            entryName,
            entryType,
          });
        }
      }
    }
  }

  domains.sort(compareByPosition);
  residues.sort(compareByPosition);
  conservedSources.sort(compareByPosition);

  const domainFeatures = domains.map((domain) => ({
    id: domain.id,
    feature_kind: 'domain',
    library: domain.library,
    start: domain.start,
    end: domain.end,
    color: domain.color,
    short_name: domain.name,
    shape: domain.shape,
    accession: domain.accession,
    type: domain.type,
    description: domain.description,
    length: domain.length,
    section: domain.section,
    representative: domain.representative,
    integrated: domain.integrated,
    entry_accession: domain.entryAccession,
    entry_name: domain.entryName,
    entry_type: domain.entryType,
    interpro_label: getInterproLabel(domain),
  }));

  const conservedSourceFeatures = conservedSources.map((source) => ({
    id: source.id,
    feature_kind: 'conserved_source',
    library: source.library,
    start: source.start,
    end: source.end,
    color: source.color,
    short_name: source.name,
    shape: 'roundRectangle',
    accession: source.accession,
    type: 'Conserved residues source',
    description: source.name,
    length: source.length,
    site_count: source.siteCount,
    representative: source.representative,
    integrated: source.integrated,
    entry_accession: source.entryAccession,
    entry_name: source.entryName,
    entry_type: source.entryType,
    interpro_label: getInterproLabel(source),
  }));

  const residueFeatures = residues.map((residue) => ({
    id: residue.id,
    feature_kind: 'conserved_residue',
    library: residue.library,
    start: residue.start,
    end: residue.end,
    color: residue.color,
    short_name: residue.residue || 'site',
    shape: 'rectangle',
    accession: residue.accession,
    source_name: residue.sourceName,
    site_description: residue.siteDescription,
    residue: residue.residue,
    length: residue.length,
    integrated: residue.integrated,
    entry_accession: residue.entryAccession,
    entry_name: residue.entryName,
    entry_type: residue.entryType,
    interpro_label: getInterproLabel(residue),
  }));

  const sectionTracks = buildSectionTracks(domainFeatures);
  const representativeFamilies = buildRepresentativeSummary(domains.filter((domain) => domain.section === 'family' && domain.representative));
  const representativeDomains = buildRepresentativeSummary(domains.filter((domain) => domain.section === 'domain' && domain.representative));
  const regionPredictors = buildRegionPredictorSummary(domains.filter((domain) => domain.section === 'region'));
  const integrationSummary = buildIntegrationSummary(domains);

  return {
    domains,
    residues,
    conservedSources,
    domainFeatures,
    conservedSourceFeatures,
    residueFeatures,
    sectionTracks,
    representativeFamilies,
    representativeDomains,
    regionPredictors,
    integrationSummary,
  };
}

// Parse JSONL and find protein by ID
function findProtein(proteinId, jsonlFile) {
  if (!fs.existsSync(jsonlFile)) {
    console.error(`Error: ${jsonlFile} not found`);
    process.exit(1);
  }

  const text = fs.readFileSync(jsonlFile, 'utf-8');
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const xref = data.results?.[0]?.xref?.[0];
      if (xref && data.results[0].sequence) {
        const id = xref.name;
        if (id.toLowerCase() === proteinId.toLowerCase()) {
          return {
            id,
            sequence: data.results[0].sequence,
            matches: data.results[0].matches || [],
          };
        }
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return null;
}

// List available proteins
function listProteins(jsonlFile) {
  if (!fs.existsSync(jsonlFile)) {
    console.error(`Error: ${jsonlFile} not found`);
    process.exit(1);
  }

  const text = fs.readFileSync(jsonlFile, 'utf-8');
  const lines = text.split('\n');
  const proteins = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const xref = data.results?.[0]?.xref?.[0];
      if (xref && data.results[0].sequence) {
        proteins.push(xref.name);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return proteins;
}

// Generate HTML file for protein
function generateHTML(protein) {
  const annotations = extractAnnotations(protein.matches);
  const proteinData = JSON.stringify({ id: protein.id, sequence: protein.sequence });
  const annotationsData = JSON.stringify(annotations);

  const scriptContent = `
    import '@nightingale-elements/nightingale-new-core@latest';
    import '@nightingale-elements/nightingale-sequence@latest';
    import '@nightingale-elements/nightingale-manager@latest';
    import '@nightingale-elements/nightingale-navigation@latest';
    import '@nightingale-elements/nightingale-interpro-track@latest';

    const protein = ${proteinData};
    const annotations = ${annotationsData};
    const CONSERVED_RESIDUE_COLOR = '${CONSERVED_RESIDUE_COLOR}';

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function sectionDisplayName(key) {
      if (key === 'family') return 'Family';
      if (key === 'domain') return 'Domain';
      if (key === 'region') return 'Region';
      return 'Domain';
    }

    function buildLegendHtml(domainFeatures, hasResidues) {
      const libraries = [...new Set(domainFeatures.map((feature) => feature.library))].sort();
      let html = '<div style="margin-top: 20px;"><h3>Legend</h3>';
      html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">';

      for (const library of libraries) {
        const domain = domainFeatures.find((item) => item.library === library);
        if (!domain) continue;
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += '<div style="width: 20px; height: 20px; background-color: ' + domain.color + '; border-radius: 3px;"></div>';
        html += '<span>' + escapeHtml(library) + '</span>';
        html += '</div>';
      }

      if (hasResidues) {
        html += '<div style="display: flex; align-items: center; gap: 8px;">';
        html += '<div style="width: 20px; height: 20px; background-color: ' + CONSERVED_RESIDUE_COLOR + '; border-radius: 3px;"></div>';
        html += '<span>Conserved residues</span>';
        html += '</div>';
      }

      html += '</div></div>';
      return html;
    }

    function buildRepresentativeList(title, items) {
      let html = '<div class="summary-block"><h4>' + escapeHtml(title) + '</h4>';
      if (!items.length) {
        html += '<p class="summary-empty">None</p></div>';
        return html;
      }

      html += '<ul class="summary-list">';
      for (const item of items) {
        const interproLabel = item.integrated
          ? (item.entryAccession ? 'Integrated (' + item.entryAccession + ')' : 'Integrated')
          : 'Unintegrated';
        html += '<li>';
        html += '<span class="swatch" style="background-color:' + item.color + ';"></span>';
        html += '<div>';
        html += '<div class="summary-title">' + escapeHtml(item.name) + '</div>';
        html += '<div class="summary-meta">' + escapeHtml(item.library) + ' | ' + escapeHtml(interproLabel) + '</div>';
        html += '</div>';
        html += '</li>';
      }
      html += '</ul></div>';
      return html;
    }

    function buildPredictorList(title, items) {
      let html = '<div class="summary-block"><h4>' + escapeHtml(title) + '</h4>';
      if (!items.length) {
        html += '<p class="summary-empty">None</p></div>';
        return html;
      }

      html += '<ul class="summary-list">';
      for (const item of items) {
        html += '<li>';
        html += '<span class="swatch" style="background-color:' + item.color + ';"></span>';
        html += '<div>';
        html += '<div class="summary-title">' + escapeHtml(item.name) + '</div>';
        html += '<div class="summary-meta">' + escapeHtml(item.library) + ' | ' + escapeHtml(item.accession) + '</div>';
        html += '</div>';
        html += '</li>';
      }
      html += '</ul></div>';
      return html;
    }

    function buildSummaryPanelHtml(annotationsObj) {
      let html = '<div class="summary-block"><h4>Integration Summary</h4>';
      html += '<div class="summary-kpi">Integrated signatures: <strong>' + annotationsObj.integrationSummary.integrated + '</strong></div>';
      html += '<div class="summary-kpi">Unintegrated signatures: <strong>' + annotationsObj.integrationSummary.unintegrated + '</strong></div>';
      html += '</div>';
      html += buildRepresentativeList('Representative families', annotationsObj.representativeFamilies || []);
      html += buildRepresentativeList('Representative domains', annotationsObj.representativeDomains || []);
      html += buildPredictorList('Region predictors', annotationsObj.regionPredictors || []);
      return html;
    }

    function buildDomainsTable(domains) {
      if (!domains.length) {
        return '<div style="margin-top: 20px;"><h3>Domains</h3><p>No domain features detected.</p></div>';
      }

      let html = '<div style="margin-top: 20px;"><h3>Domains</h3><table style="width: 100%; border-collapse: collapse;">';
      html += '<thead style="background-color: #f0f0f0;"><tr>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Name</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Database</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Section</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Representative</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">InterPro</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Position</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Length</th>';
      html += '</tr></thead><tbody>';

      for (const domain of domains) {
        const interpro = domain.integrated
          ? (domain.entryAccession ? 'Integrated (' + domain.entryAccession + ')' : 'Integrated')
          : 'Unintegrated';
        html += '<tr style="border-bottom: 1px solid #eee;">';
        html += '<td style="padding: 8px;"><span style="display: inline-block; width: 12px; height: 12px; background-color: ' + domain.color + '; margin-right: 6px; border-radius: 2px;"></span>' + escapeHtml(domain.name) + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(domain.library) + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(sectionDisplayName(domain.section)) + '</td>';
        html += '<td style="padding: 8px;">' + (domain.representative ? 'Yes' : 'No') + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(interpro) + '</td>';
        html += '<td style="padding: 8px;">' + domain.start + '-' + domain.end + '</td>';
        html += '<td style="padding: 8px;">' + domain.length + ' aa</td>';
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    }

    function buildResiduesTable(residues) {
      if (!residues.length) {
        return '';
      }

      let html = '<div style="margin-top: 20px;"><h3>Conserved Residues</h3><table style="width: 100%; border-collapse: collapse;">';
      html += '<thead style="background-color: #f0f0f0;"><tr>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Residue</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Position</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Annotation</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Source</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">InterPro</th>';
      html += '<th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Database</th>';
      html += '</tr></thead><tbody>';

      for (const residue of residues) {
        const residueLabel = residue.residue ? escapeHtml(residue.residue) : '-';
        const interpro = residue.integrated
          ? (residue.entryAccession ? 'Integrated (' + residue.entryAccession + ')' : 'Integrated')
          : 'Unintegrated';
        html += '<tr style="border-bottom: 1px solid #eee;">';
        html += '<td style="padding: 8px;"><span style="display: inline-block; width: 12px; height: 12px; background-color: ' + CONSERVED_RESIDUE_COLOR + '; margin-right: 6px; border-radius: 2px;"></span>' + residueLabel + '</td>';
        html += '<td style="padding: 8px;">' + residue.start + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(residue.siteDescription) + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(residue.sourceName) + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(interpro) + '</td>';
        html += '<td style="padding: 8px;">' + escapeHtml(residue.library) + '</td>';
        html += '</tr>';
      }

      html += '</tbody></table></div>';
      return html;
    }

    function removeTooltip(track) {
      if (track._currentTooltip) {
        track._currentTooltip.remove();
        track._currentTooltip = null;
      }
    }

    function createTooltipContent(feature) {
      const interpro = feature.interpro_label || 'Unintegrated';

      if (feature.feature_kind === 'conserved_residue') {
        const residueText = feature.residue ? feature.residue : '-';
        return '<strong>' + escapeHtml(feature.site_description || 'Conserved residue') + '</strong><br>' +
          'Residue: ' + escapeHtml(residueText) + '<br>' +
          'Position: ' + feature.start + '<br>' +
          'Source: ' + escapeHtml(feature.source_name || 'Unknown') + '<br>' +
          'InterPro: ' + escapeHtml(interpro) + '<br>' +
          'Database: ' + escapeHtml(feature.library || 'Unknown') + '<br>' +
          'Accession: ' + escapeHtml(feature.accession || 'Unknown');
      }

      if (feature.feature_kind === 'conserved_source') {
        return '<strong>' + escapeHtml(feature.short_name || 'Conserved residue source') + '</strong><br>' +
          'Position: ' + feature.start + '-' + feature.end + '<br>' +
          'Site count: ' + feature.site_count + '<br>' +
          'InterPro: ' + escapeHtml(interpro) + '<br>' +
          'Database: ' + escapeHtml(feature.library || 'Unknown') + '<br>' +
          'Accession: ' + escapeHtml(feature.accession || 'Unknown');
      }

      return '<strong>' + escapeHtml(feature.short_name || 'Unknown') + '</strong><br>' +
        'Database: ' + escapeHtml(feature.library || 'Unknown') + '<br>' +
        'Accession: ' + escapeHtml(feature.accession || 'Unknown') + '<br>' +
        'Section: ' + escapeHtml(sectionDisplayName(feature.section)) + '<br>' +
        'Representative: ' + (feature.representative ? 'Yes' : 'No') + '<br>' +
        'InterPro: ' + escapeHtml(interpro) + '<br>' +
        'Position: ' + feature.start + '-' + feature.end + ' (' + feature.length + ' aa)';
    }

    function addSectionTitle(container, label) {
      const section = document.createElement('div');
      section.className = 'track-section-label';
      section.textContent = label;
      container.appendChild(section);
    }

    function addTrack(config) {
      const container = config.container;
      const label = config.label;
      const features = config.features;
      const length = config.length;
      const showLabels = config.showLabels;

      const trackRow = document.createElement('div');
      trackRow.className = 'track-row';

      const trackLabel = document.createElement('div');
      trackLabel.className = 'track-label';
      trackLabel.textContent = label;
      trackRow.appendChild(trackLabel);

      const trackWrapper = document.createElement('div');
      trackWrapper.className = 'track-wrapper';
      trackWrapper.innerHTML = '<nightingale-interpro-track height="25" highlight-event="onmouseover" use-ctrl-to-zoom></nightingale-interpro-track>';
      trackRow.appendChild(trackWrapper);
      container.appendChild(trackRow);

      const track = trackWrapper.querySelector('nightingale-interpro-track');
      track.setAttribute('length', length);
      track.data = features;

      if (showLabels) {
        track.setAttribute('show-label', '');
        track.setAttribute('label', '.feature.short_name');
      }

      track.addEventListener('mouseenter', function(event) {
        const feature = event.detail;
        if (!feature) return;

        removeTooltip(track);
        const tooltip = document.createElement('div');
        tooltip.style.cssText = 'position: fixed; background: #333; color: white; padding: 10px; border-radius: 4px; font-size: 12px; z-index: 1000; max-width: 360px; pointer-events: none;';
        tooltip.innerHTML = createTooltipContent(feature);
        document.body.appendChild(tooltip);

        const pageX = event.pageX || 20;
        const pageY = event.pageY || 20;
        tooltip.style.left = (pageX + 10) + 'px';
        tooltip.style.top = (pageY + 10) + 'px';

        track._currentTooltip = tooltip;
      });

      track.addEventListener('mouseleave', function() {
        removeTooltip(track);
      });
    }

    async function init() {
      const infoDiv = document.getElementById('info');
      const tracksContainer = document.getElementById('tracks-container');
      const sequenceEl = document.getElementById('sequence');
      const navigation = document.getElementById('navigation');
      const summaryPanel = document.getElementById('summary-panel');

      const sequenceLength = protein.sequence.length;
      const domains = annotations.domains || [];
      const residues = annotations.residues || [];
      const domainFeatures = annotations.domainFeatures || [];
      const conservedSourceFeatures = annotations.conservedSourceFeatures || [];
      const residueFeatures = annotations.residueFeatures || [];
      const sectionTracks = annotations.sectionTracks || [];

      infoDiv.innerHTML = '<strong>' + escapeHtml(protein.id) + '</strong><br>' +
        'Sequence length: ' + sequenceLength + ' aa<br>' +
        'Domain/region matches: ' + domains.length + '<br>' +
        'Conserved residues: ' + residues.length;

      infoDiv.innerHTML += buildLegendHtml(domainFeatures, residues.length > 0);
      infoDiv.innerHTML += buildDomainsTable(domains);
      infoDiv.innerHTML += buildResiduesTable(residues);

      summaryPanel.innerHTML = buildSummaryPanelHtml(annotations);

      await customElements.whenDefined('nightingale-navigation');
      await customElements.whenDefined('nightingale-sequence');
      await customElements.whenDefined('nightingale-interpro-track');

      navigation.setAttribute('length', sequenceLength);
      navigation.setAttribute('display-end', sequenceLength);

      sequenceEl.sequence = protein.sequence;
      sequenceEl.setAttribute('length', sequenceLength);

      for (const sectionTrack of sectionTracks) {
        addSectionTitle(tracksContainer, sectionTrack.label);

        if (sectionTrack.representativeFeatures && sectionTrack.representativeFeatures.length > 0) {
          addTrack({
            container: tracksContainer,
            label: sectionTrack.representativeLabel,
            features: sectionTrack.representativeFeatures,
            length: sequenceLength,
            showLabels: true,
          });
        }

        for (const libTrack of sectionTrack.libraryTracks || []) {
          addTrack({
            container: tracksContainer,
            label: libTrack.label,
            features: libTrack.features,
            length: sequenceLength,
            showLabels: true,
          });
        }
      }

      if (conservedSourceFeatures.length > 0 || residueFeatures.length > 0) {
        addSectionTitle(tracksContainer, 'Conserved Residues');

        if (conservedSourceFeatures.length > 0) {
          addTrack({
            container: tracksContainer,
            label: 'Source annotations',
            features: conservedSourceFeatures,
            length: sequenceLength,
            showLabels: true,
          });
        }

        if (residueFeatures.length > 0) {
          addTrack({
            container: tracksContainer,
            label: 'Residue markers',
            features: residueFeatures,
            length: sequenceLength,
            showLabels: false,
          });
        }
      }
    }

    init();
  `;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${protein.id} - Protein Visualization</title>
  <script async src="https://ga.jspm.io/npm:es-module-shims@1.6.2/dist/es-module-shims.js"></script>

  <script type="importmap">
    {
      "imports": {
        "@nightingale-elements/": "https://cdn.jsdelivr.net/npm/@nightingale-elements/"
      }
    }
  </script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 20px;
      background: #f5f5f5;
    }

    h1 {
      color: #333;
      margin-bottom: 20px;
    }

    .controls {
      background: white;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .info {
      background: white;
      padding: 20px;
      border-radius: 6px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      min-height: 20px;
      color: #666;
      font-size: 14px;
    }

    .info h3 {
      margin: 20px 0 15px 0;
      color: #333;
      font-size: 16px;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 10px;
    }

    .info h3:first-of-type {
      margin-top: 0;
    }

    .info table {
      font-size: 13px;
    }

    .info table th, .info table td {
      padding: 10px 8px;
      text-align: left;
    }

    .info table th {
      font-weight: 600;
      color: #333;
    }

    .info table tr:hover {
      background-color: #f9f9f9;
    }

    .feature-viewer {
      background: white;
      padding: 16px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow-x: auto;
    }

    .viewer-layout {
      display: grid;
      grid-template-columns: minmax(900px, 1fr) 320px;
      gap: 16px;
      align-items: start;
    }

    .tracks-pane {
      min-width: 900px;
    }

    .summary-panel {
      border-left: 1px solid #e8e8e8;
      padding-left: 16px;
      font-size: 13px;
      color: #333;
    }

    .summary-block {
      margin-bottom: 14px;
    }

    .summary-block h4 {
      margin: 0 0 8px 0;
      font-size: 15px;
      color: #333;
    }

    .summary-kpi {
      margin: 4px 0;
      color: #555;
    }

    .summary-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .summary-list li {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      align-items: flex-start;
    }

    .summary-title {
      line-height: 1.2;
      font-weight: 500;
      color: #222;
    }

    .summary-meta {
      line-height: 1.2;
      color: #666;
      font-size: 12px;
      margin-top: 2px;
    }

    .swatch {
      width: 11px;
      height: 11px;
      border-radius: 2px;
      margin-top: 3px;
      flex: none;
    }

    .summary-empty {
      margin: 0;
      color: #777;
      font-style: italic;
    }

    nightingale-manager > div {
      line-height: 0;
      width: 1000px;
    }

    .track-section-label {
      margin-top: 14px;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 700;
      color: #333;
      border-top: 1px solid #ececec;
      padding-top: 10px;
    }

    .track-section-label:first-child {
      margin-top: 0;
      border-top: none;
      padding-top: 0;
    }

    .track-row {
      display: grid;
      grid-template-columns: 190px 1fr;
      align-items: center;
      margin-bottom: 5px;
      column-gap: 8px;
    }

    .track-label {
      font-size: 12px;
      color: #333;
      text-align: right;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-wrapper {
      line-height: 0;
    }

    @media (max-width: 1400px) {
      .viewer-layout {
        grid-template-columns: 1fr;
      }

      .summary-panel {
        border-left: none;
        border-top: 1px solid #e8e8e8;
        padding-left: 0;
        padding-top: 14px;
      }
    }
  </style>
</head>
<body>
  <h1>Protein Visualization</h1>

  <div class="controls">
    <span>Protein: <strong>${protein.id}</strong></span>
  </div>

  <div id="info" class="info"></div>

  <section class="feature-viewer">
    <div class="viewer-layout">
      <div class="tracks-pane">
        <nightingale-manager id="manager">
          <div>
            <nightingale-navigation id="navigation" height="50" show-highlight></nightingale-navigation>
          </div>
          <div>
            <nightingale-sequence id="sequence" height="30"></nightingale-sequence>
          </div>
          <div id="tracks-container" style="line-height: 0"></div>
        </nightingale-manager>
      </div>
      <aside id="summary-panel" class="summary-panel"></aside>
    </div>
  </section>

  <script type="module">${scriptContent}
  </script>
</body>
</html>`;

  return html;
}

function drawShape(x, y, width, height, color, shape) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  if (shape === 'diamond') {
    return `<polygon points="${centerX},${y} ${x + width},${centerY} ${centerX},${y + height} ${x},${centerY}" fill="${color}" stroke="#333" stroke-width="0.5" opacity="0.85"/>`;
  }
  if (shape === 'bridge') {
    const cp1 = x + width / 4;
    const cp2 = x + (3 * width) / 4;
    return `<path d="M ${x} ${centerY} Q ${cp1} ${y} ${cp2} ${y} T ${x + width} ${centerY}" fill="none" stroke="${color}" stroke-width="2" opacity="0.85"/>`;
  }
  if (shape === 'rectangle') {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="#333" stroke-width="0.5" opacity="0.85"/>`;
  }

  const cornerRadius = height / 2;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${color}" stroke="#333" stroke-width="0.5" opacity="0.85"/>`;
}

function drawFeaturesInTrack(features, spec, currentTrackY, leftPadding, pixelsPerAA, trackHeight) {
  let svg = '';
  for (const feature of features) {
    const x = leftPadding + (feature.start - 1) * pixelsPerAA;
    if (spec.kind === 'residue-markers' || feature.feature_kind === 'conserved_residue') {
      if (feature.length > 1) {
        const width = Math.max(2, feature.length * pixelsPerAA);
        svg += `\n  <rect x="${x}" y="${currentTrackY + 4}" width="${width}" height="${trackHeight - 8}" fill="${feature.color}"/>`;
      } else {
        svg += `\n  <line x1="${x}" y1="${currentTrackY + 3}" x2="${x}" y2="${currentTrackY + trackHeight - 3}" stroke="${feature.color}" stroke-width="2.2"/>`;
      }
      continue;
    }

    const width = Math.max(2, feature.length * pixelsPerAA);
    svg += `\n  ${drawShape(x, currentTrackY, width, trackHeight, feature.color, feature.shape || 'roundRectangle')}`;
    if (spec.showLabels && width > 34) {
      svg += `\n  <text x="${x + width / 2}" y="${currentTrackY + trackHeight / 2 + 4}" class="domain-label" text-anchor="middle" pointer-events="none">${escapeXml(feature.short_name || feature.name || '')}</text>`;
    }
  }
  return svg;
}

function generateSVG(protein) {
  const annotations = extractAnnotations(protein.matches);
  const domains = annotations.domains;
  const residues = annotations.residues;
  const sectionTracks = annotations.sectionTracks;
  const conservedSourceFeatures = annotations.conservedSourceFeatures;
  const residueFeatures = annotations.residueFeatures;
  const representativeFamilies = annotations.representativeFamilies;
  const representativeDomains = annotations.representativeDomains;
  const seqLength = protein.sequence.length;

  const leftPadding = 220;
  const rightPadding = 60;
  const trackHeight = 22;
  const trackSpacing = 4;
  const sectionHeaderHeight = 18;
  const trackY = 100;

  const rowSpecs = [];
  for (const section of sectionTracks) {
    rowSpecs.push({ kind: 'section-header', label: section.label });
    if (section.representativeFeatures.length > 0) {
      rowSpecs.push({
        kind: 'feature-track',
        label: section.representativeLabel,
        features: section.representativeFeatures,
        showLabels: true,
      });
    }
    for (const libTrack of section.libraryTracks) {
      rowSpecs.push({
        kind: 'feature-track',
        label: libTrack.label,
        features: libTrack.features,
        showLabels: true,
      });
    }
  }
  if (conservedSourceFeatures.length > 0 || residueFeatures.length > 0) {
    rowSpecs.push({ kind: 'section-header', label: 'Conserved Residues' });
    if (conservedSourceFeatures.length > 0) {
      rowSpecs.push({
        kind: 'feature-track',
        label: 'Source annotations',
        features: conservedSourceFeatures,
        showLabels: true,
      });
    }
    if (residueFeatures.length > 0) {
      rowSpecs.push({
        kind: 'residue-markers',
        label: 'Residue markers',
        features: residueFeatures,
        showLabels: false,
      });
    }
  }

  let trackAreaHeight = 0;
  for (const spec of rowSpecs) {
    if (spec.kind === 'section-header') {
      trackAreaHeight += sectionHeaderHeight;
    } else {
      trackAreaHeight += trackHeight + trackSpacing;
    }
  }

  const legendStartY = trackY + trackAreaHeight + 30;
  const sectionCounts = representativeFamilies.length + representativeDomains.length + domains.length + residues.length;
  const svgWidth = Math.max(1000, seqLength * 0.6 + leftPadding + rightPadding);
  const svgHeight = legendStartY + sectionCounts * 14 + 360;
  const pixelsPerAA = (svgWidth - leftPadding - rightPadding) / seqLength;

  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    <style>
      .title { font-family: Arial, sans-serif; font-size: 18px; font-weight: bold; }
      .label { font-family: Arial, sans-serif; font-size: 12px; }
      .axis-label { font-family: Arial, sans-serif; font-size: 10px; fill: #666; }
      .domain-label { font-family: Arial, sans-serif; font-size: 11px; fill: #333; }
      .legend-title { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; }
      .legend-item { font-family: Arial, sans-serif; font-size: 11px; fill: #333; }
      .section-label { font-family: Arial, sans-serif; font-size: 13px; font-weight: bold; fill: #333; }
      .track-label { font-family: Arial, sans-serif; font-size: 11px; fill: #333; font-weight: 600; }
    </style>
  </defs>

  <rect width="${svgWidth}" height="${svgHeight}" fill="white"/>
  <text x="${leftPadding}" y="30" class="title">${escapeXml(protein.id)}</text>
  <text x="${leftPadding}" y="50" class="label">Sequence length: ${seqLength} aa | Domain/region matches: ${domains.length} | Conserved residues: ${residues.length}</text>
  <line x1="${leftPadding}" y1="${trackY - 10}" x2="${svgWidth - rightPadding}" y2="${trackY - 10}" stroke="#333" stroke-width="1"/>`;

  const tickInterval = seqLength > 500 ? 100 : seqLength > 200 ? 50 : 20;
  for (let i = 0; i <= seqLength; i += tickInterval) {
    const x = leftPadding + i * pixelsPerAA;
    svg += `\n  <line x1="${x}" y1="${trackY - 15}" x2="${x}" y2="${trackY - 10}" stroke="#333" stroke-width="1"/>`;
    svg += `\n  <text x="${x}" y="${trackY - 20}" class="axis-label" text-anchor="middle">${i}</text>`;
  }

  let currentY = trackY;
  for (const spec of rowSpecs) {
    if (spec.kind === 'section-header') {
      svg += `\n  <text x="${leftPadding - 5}" y="${currentY + 13}" class="section-label">${escapeXml(spec.label)}</text>`;
      currentY += sectionHeaderHeight;
      continue;
    }

    svg += `\n  <text x="${leftPadding - 10}" y="${currentY + trackHeight / 2 + 4}" class="track-label" text-anchor="end">${escapeXml(spec.label)}</text>`;
    svg += `\n  <rect x="${leftPadding}" y="${currentY}" width="${seqLength * pixelsPerAA}" height="${trackHeight}" fill="#f5f5f5" stroke="#ddd" stroke-width="1"/>`;
    svg += drawFeaturesInTrack(spec.features, spec, currentY, leftPadding, pixelsPerAA, trackHeight);
    currentY += trackHeight + trackSpacing;
  }

  svg += `\n  <text x="${leftPadding}" y="${legendStartY}" class="legend-title">Legend - Databases</text>`;
  const libraries = [...new Set(domains.map((domain) => domain.library))].sort();
  let legendX = leftPadding;
  let legendY = legendStartY + 20;
  let column = 0;

  for (const library of libraries) {
    const feature = domains.find((item) => item.library === library);
    if (!feature) continue;
    svg += `\n  <rect x="${legendX}" y="${legendY}" width="15" height="15" fill="${feature.color}" stroke="#333" stroke-width="0.5"/>`;
    svg += `\n  <text x="${legendX + 20}" y="${legendY + 12}" class="legend-item">${escapeXml(library)}</text>`;
    column += 1;
    if (column % 3 === 0) {
      legendX = leftPadding;
      legendY += 25;
    } else {
      legendX += (svgWidth - leftPadding - rightPadding) / 3;
    }
  }

  svg += `\n  <rect x="${legendX}" y="${legendY}" width="15" height="15" fill="${CONSERVED_RESIDUE_COLOR}" stroke="#333" stroke-width="0.5"/>`;
  svg += `\n  <text x="${legendX + 20}" y="${legendY + 12}" class="legend-item">Conserved residues</text>`;

  const shapeStartY = legendY + 40;
  svg += `\n  <text x="${leftPadding}" y="${shapeStartY}" class="legend-title">Legend - Feature Types</text>`;
  const shapeExamples = [
    { shape: 'roundRectangle', label: 'Domain/Family', desc: 'Family or domain components' },
    { shape: 'rectangle', label: 'Region/Motif', desc: 'Region, repeat, motif, transmembrane' },
    { shape: 'diamond', label: 'Signal peptide', desc: 'Signal peptide predictions' },
    { shape: 'bridge', label: 'Disulphide bridge', desc: 'Disulphide bond' },
  ];
  let shapeY = shapeStartY + 20;
  for (const example of shapeExamples) {
    svg += `\n  ${drawShape(leftPadding, shapeY - 5, 20, 12, '#666', example.shape)}`;
    svg += `\n  <text x="${leftPadding + 30}" y="${shapeY + 3}" class="legend-item">${escapeXml(example.label)}: ${escapeXml(example.desc)}</text>`;
    shapeY += 18;
  }

  const repStartY = shapeY + 26;
  svg += `\n  <text x="${leftPadding}" y="${repStartY}" class="legend-title">Representative families</text>`;
  let repY = repStartY + 16;
  if (representativeFamilies.length === 0) {
    svg += `\n  <text x="${leftPadding}" y="${repY}" class="legend-item">None</text>`;
    repY += 14;
  } else {
    for (const feature of representativeFamilies) {
      svg += `\n  <rect x="${leftPadding}" y="${repY - 9}" width="10" height="10" fill="${feature.color}" stroke="#333" stroke-width="0.4"/>`;
      svg += `\n  <text x="${leftPadding + 16}" y="${repY}" class="legend-item">${escapeXml(feature.name)} (${escapeXml(feature.library)})</text>`;
      repY += 14;
    }
  }

  repY += 10;
  svg += `\n  <text x="${leftPadding}" y="${repY}" class="legend-title">Representative domains</text>`;
  repY += 16;
  if (representativeDomains.length === 0) {
    svg += `\n  <text x="${leftPadding}" y="${repY}" class="legend-item">None</text>`;
    repY += 14;
  } else {
    for (const feature of representativeDomains) {
      svg += `\n  <rect x="${leftPadding}" y="${repY - 9}" width="10" height="10" fill="${feature.color}" stroke="#333" stroke-width="0.4"/>`;
      svg += `\n  <text x="${leftPadding + 16}" y="${repY}" class="legend-item">${escapeXml(feature.name)} (${escapeXml(feature.library)})</text>`;
      repY += 14;
    }
  }

  const domainTableStartY = repY + 20;
  svg += `\n  <text x="${leftPadding}" y="${domainTableStartY}" class="legend-title">Domain Details</text>`;
  let tableY = domainTableStartY + 18;
  const usableWidth = svgWidth - leftPadding - rightPadding;
  const colWidths = [usableWidth * 0.22, usableWidth * 0.14, usableWidth * 0.14, usableWidth * 0.2, usableWidth * 0.16, usableWidth * 0.14];
  svg += `\n  <text x="${leftPadding}" y="${tableY}" class="legend-item" font-weight="bold">Name</text>`;
  svg += `\n  <text x="${leftPadding + colWidths[0]}" y="${tableY}" class="legend-item" font-weight="bold">Database</text>`;
  svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1]}" y="${tableY}" class="legend-item" font-weight="bold">Section</text>`;
  svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2]}" y="${tableY}" class="legend-item" font-weight="bold">InterPro</text>`;
  svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]}" y="${tableY}" class="legend-item" font-weight="bold">Position</text>`;
  svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]}" y="${tableY}" class="legend-item" font-weight="bold">Rep</text>`;
  tableY += 14;

  for (const domain of domains) {
    const interpro = domain.integrated ? (domain.entryAccession ? `Integrated (${domain.entryAccession})` : 'Integrated') : 'Unintegrated';
    svg += `\n  <text x="${leftPadding}" y="${tableY}" class="legend-item">${escapeXml(domain.name)}</text>`;
    svg += `\n  <text x="${leftPadding + colWidths[0]}" y="${tableY}" class="legend-item">${escapeXml(domain.library)}</text>`;
    svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1]}" y="${tableY}" class="legend-item">${escapeXml(sectionLabel(domain.section))}</text>`;
    svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2]}" y="${tableY}" class="legend-item">${escapeXml(interpro)}</text>`;
    svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3]}" y="${tableY}" class="legend-item">${domain.start}-${domain.end}</text>`;
    svg += `\n  <text x="${leftPadding + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4]}" y="${tableY}" class="legend-item">${domain.representative ? 'Y' : 'N'}</text>`;
    tableY += 14;
  }

  if (residues.length > 0) {
    tableY += 16;
    svg += `\n  <text x="${leftPadding}" y="${tableY}" class="legend-title">Conserved Residues</text>`;
    tableY += 16;
    const residueColWidths = [usableWidth * 0.08, usableWidth * 0.12, usableWidth * 0.30, usableWidth * 0.24, usableWidth * 0.26];
    svg += `\n  <text x="${leftPadding}" y="${tableY}" class="legend-item" font-weight="bold">Res</text>`;
    svg += `\n  <text x="${leftPadding + residueColWidths[0]}" y="${tableY}" class="legend-item" font-weight="bold">Position</text>`;
    svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1]}" y="${tableY}" class="legend-item" font-weight="bold">Annotation</text>`;
    svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1] + residueColWidths[2]}" y="${tableY}" class="legend-item" font-weight="bold">Source</text>`;
    svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1] + residueColWidths[2] + residueColWidths[3]}" y="${tableY}" class="legend-item" font-weight="bold">InterPro</text>`;
    tableY += 14;

    for (const residue of residues) {
      const interpro = residue.integrated ? (residue.entryAccession ? `Integrated (${residue.entryAccession})` : 'Integrated') : 'Unintegrated';
      const residueLabel = residue.residue || '-';
      svg += `\n  <text x="${leftPadding}" y="${tableY}" class="legend-item">${escapeXml(residueLabel)}</text>`;
      svg += `\n  <text x="${leftPadding + residueColWidths[0]}" y="${tableY}" class="legend-item">${residue.start}</text>`;
      svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1]}" y="${tableY}" class="legend-item">${escapeXml(residue.siteDescription)}</text>`;
      svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1] + residueColWidths[2]}" y="${tableY}" class="legend-item">${escapeXml(residue.sourceName)}</text>`;
      svg += `\n  <text x="${leftPadding + residueColWidths[0] + residueColWidths[1] + residueColWidths[2] + residueColWidths[3]}" y="${tableY}" class="legend-item">${escapeXml(interpro)}</text>`;
      tableY += 14;
    }
  }

  svg += '\n</svg>';
  return svg;
}

function printUsage() {
  console.log('Usage: pnpm generate [protein-id] [options]');
  console.log('');
  console.log('Options:');
  console.log('  --svg-only         Generate only SVG (default: generates both HTML and SVG)');
  console.log('  --html-only        Generate only HTML');
  console.log('  --jsonl <path>     Read proteins from an InterProScan JSONL file (required)');
  console.log('  -j <path>          Short form of --jsonl');
  console.log('  --output <path>    Optional output file path/base name');
  console.log('  -o <path>          Short form of --output');
}

function parseCliArgs(rawArgs) {
  const options = {
    proteinId: null,
    svgOnly: false,
    htmlOnly: false,
    jsonlFile: null,
    outputFile: null,
  };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];

    if (arg === '--svg-only') {
      options.svgOnly = true;
      continue;
    }
    if (arg === '--html-only') {
      options.htmlOnly = true;
      continue;
    }
    if (arg === '--jsonl' || arg === '-j') {
      const value = rawArgs[i + 1];
      if (!value || value.startsWith('-')) {
        console.error(`Error: ${arg} requires a file path`);
        process.exit(1);
      }
      options.jsonlFile = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }
    if (arg.startsWith('--jsonl=')) {
      const value = arg.slice('--jsonl='.length).trim();
      if (!value) {
        console.error('Error: --jsonl requires a file path');
        process.exit(1);
      }
      options.jsonlFile = path.resolve(process.cwd(), value);
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      const value = rawArgs[i + 1];
      if (!value || value.startsWith('-')) {
        console.error(`Error: ${arg} requires a file path`);
        process.exit(1);
      }
      options.outputFile = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      const value = arg.slice('--output='.length).trim();
      if (!value) {
        console.error('Error: --output requires a file path');
        process.exit(1);
      }
      options.outputFile = path.resolve(process.cwd(), value);
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option "${arg}"`);
      process.exit(1);
    }
    if (!options.proteinId) {
      options.proteinId = arg;
      continue;
    }

    console.error(`Error: Unexpected argument "${arg}"`);
    process.exit(1);
  }

  if (!options.jsonlFile) {
    console.error('Error: --jsonl <path> is required');
    console.log('');
    printUsage();
    process.exit(1);
  }

  return options;
}

function ensureJsonlFileExists(jsonlFile) {
  if (!fs.existsSync(jsonlFile)) {
    console.error(`Error: ${jsonlFile} not found`);
    process.exit(1);
  }
}

function ensureParentDirExists(filePath) {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function stripSupportedExtension(filePath) {
  if (filePath.toLowerCase().endsWith('.html')) {
    return filePath.slice(0, -5);
  }
  if (filePath.toLowerCase().endsWith('.svg')) {
    return filePath.slice(0, -4);
  }
  return filePath;
}

function resolveOutputTargets(options, proteinId) {
  const shouldWriteHtml = !options.svgOnly;
  const shouldWriteSvg = !options.htmlOnly;
  const baseName = proteinId.replace(/[\/\\?%*:|"<>]/g, '_');

  if (!options.outputFile) {
    const htmlPath = shouldWriteHtml ? path.join(OUTPUT_DIR, `${baseName}.html`) : null;
    const svgPath = shouldWriteSvg ? path.join(OUTPUT_DIR, `${baseName}.svg`) : null;
    return { htmlPath, svgPath };
  }

  if (shouldWriteHtml && shouldWriteSvg) {
    const base = stripSupportedExtension(options.outputFile);
    return {
      htmlPath: `${base}.html`,
      svgPath: `${base}.svg`,
    };
  }

  if (shouldWriteHtml) {
    if (options.outputFile.toLowerCase().endsWith('.svg')) {
      console.error('Error: --output cannot end with .svg when using --html-only');
      process.exit(1);
    }
    return {
      htmlPath: options.outputFile.toLowerCase().endsWith('.html') ? options.outputFile : `${options.outputFile}.html`,
      svgPath: null,
    };
  }

  if (options.outputFile.toLowerCase().endsWith('.html')) {
    console.error('Error: --output cannot end with .html when using --svg-only');
    process.exit(1);
  }
  return {
    htmlPath: null,
    svgPath: options.outputFile.toLowerCase().endsWith('.svg') ? options.outputFile : `${options.outputFile}.svg`,
  };
}

// Main CLI logic
function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (!options.proteinId) {
    ensureJsonlFileExists(options.jsonlFile);
    printUsage();
    console.log('');
    console.log(`JSONL file: ${options.jsonlFile}`);
    console.log('');
    console.log('Available proteins:');
    const proteins = listProteins(options.jsonlFile);
    proteins.slice(0, 10).forEach((protein) => console.log(`  - ${protein}`));
    if (proteins.length > 10) {
      console.log(`  ... and ${proteins.length - 10} more`);
    }
    process.exit(0);
  }

  const protein = findProtein(options.proteinId, options.jsonlFile);

  if (!protein) {
    console.error(`Error: Protein "${options.proteinId}" not found in ${options.jsonlFile}`);
    console.log('');
    console.log('Available proteins:');
    const proteins = listProteins(options.jsonlFile);
    proteins.slice(0, 10).forEach((item) => console.log(`  - ${item}`));
    if (proteins.length > 10) {
      console.log(`  ... and ${proteins.length - 10} more`);
    }
    process.exit(1);
  }

  const outputTargets = resolveOutputTargets(options, protein.id);

  if (outputTargets.htmlPath) {
    ensureParentDirExists(outputTargets.htmlPath);
    const html = generateHTML(protein);
    fs.writeFileSync(outputTargets.htmlPath, html, 'utf-8');
    console.log(`✓ Generated HTML: ${outputTargets.htmlPath}`);
    console.log(`  Open in browser: file://${outputTargets.htmlPath}`);
  }

  if (outputTargets.svgPath) {
    ensureParentDirExists(outputTargets.svgPath);
    const svg = generateSVG(protein);
    fs.writeFileSync(outputTargets.svgPath, svg, 'utf-8');
    console.log(`✓ Generated SVG: ${outputTargets.svgPath}`);
    console.log('  Edit in: Adobe Illustrator, Inkscape, or any SVG editor');
  }
}

main();
