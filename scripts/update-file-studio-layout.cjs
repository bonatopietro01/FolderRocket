const fs = require("node:fs");
const file = "src/components/ProcessingWorkspace.tsx";
let source = fs.readFileSync(file, "utf8");

const replacements = [
  [
    '<section className="conversionPanel"><h2>Local conversion{converting&&<RotateCw className="conversionHeaderSpinner local" size={14}/>}</h2><label className="formatSelect"><FormatIcon format={format}/><select value={format} onChange={event => setFormat(event.target.value)}><option>PDF</option><option>TXT</option><option>CSV</option><option>XLSX</option></select></label>',
    '<section className="conversionPanel conversionToolCard"><h2><span className="conversionCardHeading"><RotateCw size={17}/><span>Local conversion<small>Create a copy in another format</small></span></span>{converting&&<RotateCw className="conversionHeaderSpinner local" size={14}/>}</h2><label className="formatChoiceField localFormatChoice"><span className="formatFieldCopy"><strong>Output format</strong><small>The original file remains unchanged</small></span><span className="formatSelectShell"><FormatIcon format={format}/><select aria-label="Output format" value={format} onChange={event => setFormat(event.target.value)}><option>PDF</option><option>TXT</option><option>CSV</option><option>XLSX</option></select></span></label><div className="studioQueueHeading"><span>Files to convert</span><strong>{queue.length}</strong></div>'
  ],
  [
    '<div className="conversionQueue">{queue.length ? queue.map(file => <div key={file.path} onClick={() => choosePreview(file)}><span>{file.name}</span><button type="button" title="Remove from conversion queue" onClick={event => { event.stopPropagation(); setQueue(current => current.filter(item => item.path !== file.path)); }} disabled={converting}><X size={13}/></button></div>) : null}</div>',
    '<div className="conversionQueue localConversionQueue">{queue.length ? queue.map(file => <div className="formatQueueRow" key={file.path} onClick={() => choosePreview(file)}><span className="formatQueueName" title={file.name}>{file.name}</span><span className="fileFormatBadge">{extensionOf(file.name).toUpperCase()}</span><button type="button" title="Remove from conversion queue" onClick={event => { event.stopPropagation(); setQueue(current => current.filter(item => item.path !== file.path)); }} disabled={converting}><X size={13}/></button></div>) : <p className="conversionEmptyState">Add files with the green arrow.</p>}</div>'
  ]
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error("Expected File Studio markup was not found.");
  source = source.replace(before, after);
}

fs.writeFileSync(file, source);
