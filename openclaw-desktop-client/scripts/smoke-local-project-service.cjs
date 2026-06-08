const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createLocalProject,
  listLocalProjects,
  openLocalProject,
  readLocalProjectFile,
  readLocalProjectTree,
  updateLocalProject,
} = require('../src/local-project-service.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-desktop-project-'));

try {
  const project = createLocalProject({
    name: 'Desktop Local Project Smoke',
    description: 'Created by smoke test.',
    agentIds: ['local-agent-demo'],
  }, { homeDir });

  assert(project.id.startsWith('local-project-'), `Unexpected project id: ${project.id}`);
  assert(project.workspacePath.includes(path.join(homeDir, 'openclaw', 'projects')), 'Project workspace is not under the local openclaw projects folder.');
  assert(fs.existsSync(project.workspacePath), 'Project workspace folder was not created.');

  const readme = readLocalProjectFile(project.id, 'README.md', { homeDir });
  assert(readme.content.includes('Desktop Local Project Smoke'), 'README content was not readable.');

  const tree = readLocalProjectTree(project.id, '', { homeDir });
  const childNames = new Set((tree.root.children || []).map((child) => child.name));
  assert(childNames.has('README.md'), 'Project file tree did not include README.md.');
  assert(!childNames.has('.openclaw'), 'Project file tree should hide .openclaw metadata.');

  const updated = updateLocalProject(project.id, { description: 'Updated locally.' }, { homeDir });
  assert(updated.description === 'Updated locally.', 'Project update did not persist metadata.');

  const opened = openLocalProject(project.id, { homeDir });
  assert(Boolean(opened.lastOpenedAt), 'Project open did not set lastOpenedAt.');

  const projects = listLocalProjects({ homeDir });
  assert(projects.some((item) => item.id === project.id), 'Project list did not include created project.');

  console.log(JSON.stringify({
    localProjectServiceVerified: true,
    projectId: project.id,
    workspacePath: project.workspacePath,
    listedProjects: projects.length,
    treeEntries: tree.totalEntries,
    readmeSize: readme.size,
  }, null, 2));
} finally {
  fs.rmSync(homeDir, { recursive: true, force: true });
}
