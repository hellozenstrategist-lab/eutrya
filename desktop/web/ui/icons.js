/* Local vector icons: no icon-font dependency, no missing Linux glyphs. */
(() => {
  const paths = {
    dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    swarm:'<circle cx="12" cy="12" r="3"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="20" r="2"/><path d="m6 6 4 4m4 4 4 4M6 18l4-4m4-4 4-4"/>',
    library:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 3v18m3-13h6m-6 4h6m-6 4h4"/>',
    memory:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2"/>',
    tools:'<path d="m3 14 5-7 4 10 4-10 5 7"/>',
    settings:'<path d="m10 2-.8 3-2.6 1.5-3-.8-2 3.5 2.2 2.3v3L1.6 17l2 3.5 3-.8 2.6 1.5.8 2.8h4l.8-2.8 2.6-1.5 3 .8 2-3.5-2.2-2.5v-3l2.2-2.3-2-3.5-3 .8L14.8 5 14 2Z" transform="translate(1 -1) scale(.92)"/><circle cx="12" cy="12" r="3"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    plus:'<path d="M12 4v16M4 12h16"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>', minus:'<path d="M5 12h14"/>', maximize:'<rect x="5" y="5" width="14" height="14" rx="1"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', send:'<path d="m3 3 19 9-19 9 4-9Z"/><path d="M7 12h15"/>', reload:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>',
    admin:'<path d="m3 6 4 5 5-8 5 8 4-5-3 12H6ZM6 21h12"/>', engineer:'<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-15-2 20"/>', lawyer:'<path d="M12 3v18M6 21h12M3 7h18M6 7l-4 8h8Zm12 0-4 8h8Z"/>', finance:'<path d="M4 21V11h4v10m3 0V6h4v15m3 0V2h4v19"/>', researcher:'<circle cx="9" cy="9" r="6"/><path d="m14 14 7 7M9 6v6M6 9h6"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>', file:'<path d="M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8M8 16h6"/>', folder:'<path d="M3 5h7l2 3h9v12H3Z"/>', database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>', terminal:'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="m6 8 4 4-4 4m7 0h5"/>', link:'<path d="m9 15 6-6m-6-2 3-3a5 5 0 0 1 7 7l-3 3m-1 3-3 3a5 5 0 0 1-7-7l3-3"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>', shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>', check:'<path d="m5 12 4 4L20 5"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>', grid:'<path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/>', list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>', trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>', copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', edit:'<path d="m3 16 13-13 5 5L8 21H3Zm10-10 5 5"/>', stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>', chevron:'<path d="m9 5 7 7-7 7"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>', bell:'<path d="M5 17v-6a7 7 0 0 1 14 0v6l2 2H3ZM9 22h6"/>', eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', sliders:'<path d="M4 3v18m8-18v18m8-18v18M1 8h6m2 8h6m2-10h6"/>', mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m3 5 9 8 9-8"/>'
  };
  const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.swarm}</svg>`;
  const logo=()=>'<svg class="logo" viewBox="0 0 40 44" fill="none" aria-hidden="true"><path d="M4 39 16 5h9L13 39H4Z" fill="currentColor"/><path d="m22 14 14 25h-9l-9-17 4-8Z" fill="currentColor"/></svg>';
  window.EutryaUI={icon,logo};
})();
