const saved = localStorage.getItem('wayfinder-map:theme');
if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
