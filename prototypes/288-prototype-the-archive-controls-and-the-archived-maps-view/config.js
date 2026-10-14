window.CANVAS = {
  title: 'Archive maps',
  question: 'Where should archived maps live, and how should Open and Restore read?',
  sampleState: 'Two active maps and four archive reasons. All actions use resettable in-memory fixtures.',
  ticket: 288,
  pages: [{
    id: 'round-1', title: 'Archive layout options', round: 1,
    sections: [{ title: 'Two approaches', items: [
      { id: 'A', name: 'Repository tabs', src: 'variants/a.html', width: 1120, height: 820, boardWidth: 620,
        note: { idea: 'Active and Archived maps share one repository page. Archived maps use compact rows. Open keeps the map archived; Restore is available in the list and on an opened map.', pros: ['Both lists stay easy to find.', 'Compact rows make archive reasons easy to scan.'], cons: ['A second tab stays visible during everyday use.', 'Archived rows show less context than active map cards.'] } },
      { id: 'B', name: 'Dedicated archive page', src: 'variants/b.html', width: 1120, height: 820, boardWidth: 620,
        note: { idea: 'An Archived maps link opens a separate repository page with map cards. A Back to active maps control returns to daily work.', pros: ['Active maps stay the focus of the repository page.', 'Archive cards preserve the destination and ticket progress.'], cons: ['Moving between lists requires a page change.', 'Larger cards make long archives slower to scan.'] } },
      { id: 'review', kind: 'note', name: 'Design review', text: 'Sources: docs/design/map-archive.md; src/ui/styles.css light/dark tokens and primary/ghost, map and settled styles; src/ui/repositoryView.ts mapCard, settledRow, settledSection; src/ui/home.ts bindRepositoryMaps. Real stylesheet and button classes reused. Checks: both options visually inspected in light/dark at 1280px and 390px; no horizontal overflow at 390px. Runtime fixture checks passed for Archive → archived list → Open without restoring → Restore, all four reasons, empty/loading/read-error/save-error. Native buttons, named searches, headings, list semantics and alert/status roles inspected. Tab and Enter exercised on A, visible 3px focus; hover exercised on Restore. Sampled contrast: muted text ≥4.91:1, secondary text ≥7.73:1, primary button 5.25:1; focus ≥4.76:1 in both themes. Findings: no Settle/Unsettle or collapsed Settled section; one action per location; archive stays account-specific. Not checked: exhaustive keyboard traversal, screen reader, every color pair/control boundary, disabled/saving state, installed app, live persistence. Ticket graph is a schematic preview, not a proposed replacement. No user decisions recorded.' },
    ] }],
  }],
};
