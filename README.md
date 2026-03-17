# DISCLAIMER
This repo is almost entirely vibe-coded and it's main use-case was to batch generation of initial visualization files for a manuscript figure and to be subsequently edited. I have checked for my use case that the generated outputs are correct according to the input jsonl, but please double-check if you use this for your own data.

# Protein Domain Visualization

This tool generates interactive HTML and publication-ready SVG visualizations of InterProScan results, either generated through the InterProScan web service, or from the results of running InterProScan6 (nextflow pipeline).

## Installation

First install dependencies with the package manager of your choice (pnpm, npm, yarn, bun). E.g. with pnpm:

```bash
pnpm install
```

## Usage

Generate both HTML (interactive) and SVG (publication-ready) files:

```bash
pnpm generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl
```

Generate only SVG:
```bash
pnpm generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --svg-only
```

Generate only HTML:
```bash
pnpm generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --html-only
```

Set a custom output file/base path:
```bash
pnpm generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

List proteins from a custom JSONL file:
```bash
pnpm generate --jsonl /path/to/interpro_results.jsonl
```

`--jsonl` is required for all runs.

The generated files appear in the `output/` directory.

## Runtime Options

The generator is a standard Node.js ESM script (`generate-protein.mjs`), so you can run it with different runtimes/package managers:

Direct Node:
```bash
node interpro-viz/generate-protein.mjs "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

npm:
```bash
npm --prefix interpro-viz run generate -- "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

yarn:
```bash
yarn --cwd interpro-viz generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

pnpm:
```bash
pnpm --dir interpro-viz generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

bun:
```bash
bun --cwd interpro-viz run generate "protein-id-here" --jsonl /path/to/interpro_results.jsonl --output /path/to/my_protein_plot
```

## Features

### HTML (Interactive)
- **Color Legend**: Visual guide mapping colors to InterProScan databases
- **Sectioned Tracks**: Features grouped into Families, Domains, Conserved Residues, and Region predictors
- **Representative Tracks**: Dedicated representative family/domain rows when `location.representative=true`
- **Domain Table**: Includes section, representative status, and integrated/unintegrated InterPro status
- **Conserved Residues Table**: Site-level residues parsed from InterProScan `locations[].sites`
- **Interactive Visualization**: Navigate and explore protein domains
- **Dynamic Tooltips**: Hover over domains in the visualizer for details
- **Summary Panel**: Representative family/domain summaries and integration counts

### SVG (Publication-Ready)
- **Scalable Vector Graphics**: Perfect for papers and presentations
- **Sequence Ruler**: Numbered position markers along the sequence
- **Sectioned Layout**: Grouped tracks for families, domains, conserved residues, and region predictors
- **Representative Tracks**: Separate representative rows for families/domains
- **Legend**: Color mapping for all database sources
- **Domain Table**: Includes section and integrated/unintegrated InterPro status
- **Conserved Residues Track**: Residue markers rendered on a dedicated track
- **Conserved Residues Table**: Site annotations included below domain details
- **Fully Editable**: Open in Adobe Illustrator, Inkscape, or any SVG editor

### Both Formats
- **Color-Coded Domains**: Different InterProScan databases are color-coded:
  - **Blue**: Pfam
  - **Orange**: CATH-Gene3D
  - **Green**: PANTHER
  - **Red**: SUPERFAMILY
  - **Purple**: CDD
  - **Brown**: SMART
  - **Pink**: HAMAP
  - **Gray**: PROSITE
  - **Olive**: NCBIFAM
  - **Cyan**: MobiDB-lite
- **Region/Signal Predictors**: Region-type matches (including PHOBIUS/SignalP-style tracks when present in the JSON) are rendered as standard features
- **Fragment Fallback**: Locations are parsed from `location-fragments` or `start/end` when fragments are absent
- **InterPro Status**: Signatures are explicitly labeled as integrated or unintegrated based on `signature.entry`

## Generated Output

### HTML File
Open the generated `.html` file in any modern browser to see:
- Interactive protein sequence visualization
- Color legend showing database sources
- Complete domain list table
- Nightingale visualization for zooming and panning

### SVG File
Open the generated `.svg` file to:
- View in any browser as a scalable image
- Edit in Adobe Illustrator, Inkscape, Figma, or any SVG editor
- Export to PNG, PDF, or other formats
- Customize colors, fonts, and layout for publication

## File Structure

- `generate-protein.mjs` - Main CLI script that generates HTML and SVG files
- `package.json` - Node.js project configuration with `pnpm generate` script
- `output/` - Directory where generated files are saved

## Data Format

The tool expects an InterProScan JSONL file where each line contains:
```json
{
  "results": [{
    "sequence": "PROTEIN_SEQUENCE",
    "matches": [...],
    "xref": [{"name": "protein_id"}]
  }]
}
```

The visualization extracts:
- Protein sequence and length
- All domain matches with their positions
- Conserved residues and site annotations
- Domain names and InterProScan library sources

## Troubleshooting

- **Proteins not loading**: Check that `endolysin_proteins.faa.jsonl` is in the parent directory
- **CORS error**: Make sure you're using the Python server (`serve.py`) and not opening the HTML file directly
- **Nightingale elements not rendering**: Check browser console for errors, ensure JavaScript is enabled

## Technology Stack

- **Nightingale**: Web components for protein visualization
- **ES modules**: Modern JavaScript module loading
- **Fetch API**: Data loading from JSONL
