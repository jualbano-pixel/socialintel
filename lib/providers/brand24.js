import * as brand24 from '../brand24-rest';

export const brand24Provider = {
  id: 'brand24',
  name: 'Brand24',
  capabilities: {
    mentions: true, count: true, reach: true, projects: true, createProjects: true,
    filteredSourceSample: true, enrichment: true, topics: true, authors: true, rawReddit: true, rawTikTok: true,
  },
  listProjects: accountId => brand24.listProjects(accountId),
  createProject: (...args) => brand24.createProject(...args),
  fetchMentions: ({ projectId, dateFrom, dateTo, ...options }) => brand24.getMentions(projectId, dateFrom, dateTo, options),
  fetchCount: ({ projectId, dateFrom, dateTo, ...options }) => brand24.getMentionsCount(projectId, dateFrom, dateTo, options),
  fetchReach: ({ projectId, dateFrom, dateTo, ...options }) => brand24.getMentionsReach(projectId, dateFrom, dateTo, options),
  fetchEnrichment: ({ projectId, dateFrom, dateTo, sections }) => brand24.getProjectEnrichment(projectId, dateFrom, dateTo, sections),
};
