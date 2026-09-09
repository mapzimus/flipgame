(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const state = { snapshot: null, severity: 'all', showVerified: false };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function relativeTime(value) {
    if (!value) return '—';
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const absolute = Math.abs(seconds);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (absolute < 60) return formatter.format(seconds, 'second');
    if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
    if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
    return formatter.format(Math.round(seconds / 86400), 'day');
  }

  function renderWaves(snapshot) {
    const list = byId('waves');
    const fragment = document.createDocumentFragment();
    snapshot.config.waves.forEach((wave) => {
      const row = node('li', 'wave-row');
      row.append(node('span', 'wave-number', String(wave.id).padStart(2, '0')));
      row.append(node('span', `state-bar ${wave.state}`));
      const copy = node('div', 'wave-copy');
      copy.append(node('strong', '', wave.name));
      copy.append(node('small', '', wave.note));
      row.append(copy);
      fragment.append(row);
    });
    list.replaceChildren(fragment);
  }

  function renderFocus(snapshot) {
    const fragment = document.createDocumentFragment();
    snapshot.config.focus.forEach((item) => fragment.append(node('li', '', item)));
    byId('focus').replaceChildren(fragment);
  }

  function renderWorkstream(configured, worktrees) {
    const stream = node('article', 'workstream');
    stream.dataset.state = configured.state;
    const header = node('div', 'workstream-header');
    header.append(node('h3', '', configured.name));
    header.append(node('span', 'state-label', configured.state));
    stream.append(header);
    stream.append(node('p', '', configured.detail));
    const branch = node('div', 'branch-line');
    branch.append(node('code', '', configured.branch.replace('codex/v112-', '')));
    const matching = worktrees.find((item) => item.branch === configured.branch);
    branch.append(node('b', '', matching ? matching.shortHead : 'not created'));
    stream.append(branch);
    const activity = node('div', 'branch-line');
    if (matching) {
      const delta = matching.branch === 'codex/v112-integration'
        ? `${matching.dirtyFiles} dirty`
        : `+${matching.ahead} / −${matching.behind}`;
      activity.append(node('code', '', matching.subject || 'No commit message'));
      activity.append(node('b', '', delta));
    } else {
      activity.append(node('code', '', 'Waiting for isolated worktree'));
      activity.append(node('b', '', '—'));
    }
    stream.append(activity);
    return stream;
  }

  function renderWorkstreams(snapshot) {
    const fragment = document.createDocumentFragment();
    snapshot.config.workstreams.forEach((configured) => fragment.append(
      renderWorkstream(configured, snapshot.worktrees)
    ));
    byId('workstreams').replaceChildren(fragment);
  }

  function renderGates(snapshot) {
    const fragment = document.createDocumentFragment();
    snapshot.config.gates.forEach((gate) => {
      const item = node('article', 'gate');
      const top = node('div', 'gate-top');
      top.append(node('span', `state-dot ${gate.state}`));
      top.append(node('strong', '', gate.name));
      item.append(top, node('p', '', gate.detail));
      fragment.append(item);
    });
    byId('gates').replaceChildren(fragment);
  }

  function renderTests(snapshot) {
    const current = snapshot.tests;
    const running = current.state === 'running';
    const button = byId('run-tests');
    button.disabled = running;
    button.textContent = running ? 'Running…' : 'Run now';
    const total = current.results.length;
    byId('test-progress').textContent = current.state === 'waiting'
      ? 'Waiting for the first local run.'
      : `${current.passed} passed · ${current.failed} failed · ${total} total · ${current.reason || 'local run'}`;
    byId('test-score').textContent = running ? `${current.passed}/${total}` : total ? `${current.passed}/${total}` : '—';
    byId('test-time').textContent = running
      ? `Started ${relativeTime(current.startedAt)}`
      : current.finishedAt ? `Finished ${relativeTime(current.finishedAt)}` : 'Not run yet';

    const fragment = document.createDocumentFragment();
    current.results.forEach((test) => {
      const row = node('li');
      row.append(node('span', `state-dot ${test.state}`));
      const label = node('span', 'test-name', test.name);
      if (test.summary) label.setAttribute('title', test.summary);
      row.append(label);
      row.append(node('small', 'test-duration', Number.isFinite(test.durationMs) ? `${test.durationMs} ms` : test.state));
      fragment.append(row);
    });
    byId('tests').replaceChildren(fragment);
  }

  function renderCommits(snapshot) {
    const fragment = document.createDocumentFragment();
    snapshot.commits.forEach((commit) => {
      const row = node('li');
      row.append(node('code', '', commit.shortHead));
      row.append(node('span', 'commit-subject', commit.subject));
      const time = node('time', '', relativeTime(commit.committedAt));
      time.dateTime = commit.committedAt;
      row.append(time);
      fragment.append(row);
    });
    byId('commits').replaceChildren(fragment);
  }

  function renderDefects(snapshot) {
    const body = byId('defects');
    const defects = snapshot.defects.filter((item) => {
      if (state.severity !== 'all' && item.severity !== state.severity) return false;
      return state.showVerified || item.disposition !== 'verified';
    });
    const fragment = document.createDocumentFragment();
    defects.forEach((defect) => {
      const row = document.createElement('tr');
      row.append(node('td', '', defect.id));
      const severity = node('td');
      severity.append(node('span', 'severity', defect.severity));
      row.append(severity);
      row.append(node('td', '', defect.subsystem));
      row.append(node('td', '', defect.reproduction));
      const disposition = node('td');
      disposition.append(node('span', `disposition ${defect.disposition}`, defect.disposition));
      disposition.append(document.createElement('br'));
      disposition.append(node('span', '', defect.status));
      row.append(disposition);
      fragment.append(row);
    });
    if (!defects.length) {
      const row = document.createElement('tr');
      const cell = node('td', 'empty-row', 'No defects match this view.');
      cell.colSpan = 5;
      row.append(cell);
      fragment.append(row);
    }
    body.replaceChildren(fragment);
  }

  function render(snapshot) {
    state.snapshot = snapshot;
    byId('headline').textContent = snapshot.config.headline;
    byId('live-state').textContent = 'LIVE LOCAL';
    byId('live-state').className = 'connected';
    byId('head').textContent = snapshot.integration.shortHead;
    byId('branch').textContent = snapshot.integration.branch;
    byId('commit-count').textContent = snapshot.integration.commitsSincePublicBaseline;
    byId('dirty-count').textContent = `${snapshot.integration.dirtyFiles} uncommitted integration file${snapshot.integration.dirtyFiles === 1 ? '' : 's'}`;
    const blockers = snapshot.counts.p0 + snapshot.counts.p1 + snapshot.counts.p2;
    byId('blocker-count').textContent = blockers;
    byId('blocker-split').textContent = `${snapshot.counts.p0} P0 · ${snapshot.counts.p1} P1 · ${snapshot.counts.p2} P2`;
    byId('candidate-state').textContent = snapshot.config.candidateState;
    byId('refresh-time').textContent = `Updated ${relativeTime(snapshot.generatedAt)}`;
    byId('contract-revision').textContent = snapshot.integration.latestRevision
      ? `Revision ${snapshot.integration.latestRevision.number}`
      : 'Revision —';
    byId('public-baseline').textContent = `Public ${snapshot.config.publicVersion} · ${snapshot.config.publicBaseline.slice(0, 8)} · unchanged`;
    renderWaves(snapshot);
    renderFocus(snapshot);
    renderWorkstreams(snapshot);
    renderGates(snapshot);
    renderTests(snapshot);
    renderCommits(snapshot);
    renderDefects(snapshot);
  }

  async function refresh() {
    try {
      const response = await fetch(`/api/status?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      render(await response.json());
    } catch (error) {
      byId('live-state').textContent = 'DISCONNECTED';
      byId('live-state').className = 'error';
      byId('headline').textContent = `Status feed unavailable: ${error.message}`;
    }
  }

  byId('run-tests').addEventListener('click', async () => {
    byId('run-tests').disabled = true;
    await fetch('/api/tests/run', { method: 'POST' });
    await refresh();
  });
  byId('severity-filter').addEventListener('change', (event) => {
    state.severity = event.target.value;
    if (state.snapshot) renderDefects(state.snapshot);
  });
  byId('show-verified').addEventListener('change', (event) => {
    state.showVerified = event.target.checked;
    if (state.snapshot) renderDefects(state.snapshot);
  });

  void refresh();
  window.setInterval(() => void refresh(), 4000);
})();
