/*
  Fixture for #366: the reply typed on the phone and the T3 Code thread it goes to.
  #230's run, the map and tickets come from #224's phone-data.js (copied unchanged).
*/
window.REPLY = {
  message:
    'Before I merge #341: add a test that the remote route also rejects an expired pairing secret, and push it to the same PR. Keep the loopback routes as they are.',
  replyId: 'r-7K2Q-41FD',
  // The T3 Code thread Wayfinder opened for #230, as RAMON-PC reports it.
  thread: { id: 'thr-8f3a', short: 'thread 8f3a', title: '#230 Desktop side: pairing and a remote endpoint', project: 'wayfinder-map', since: '10:02' },
  // Changed: a new thread was started for #230 on the desktop after the reply was checked.
  newThread: { id: 'thr-c71e', short: 'thread c71e', title: '#230 Desktop side: pairing and a remote endpoint (2)', project: 'wayfinder-map', since: '10:34' },
  failedWhy: 'RAMON‑PC couldn’t hand it to T3 Code: T3 Code isn’t running there.',
};
