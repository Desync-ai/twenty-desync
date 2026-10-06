// Desync: a single user may own and/or join up to this many workspaces. The
// upstream model was effectively one-per-user; we allow a small number so a
// person can have their own workspace and still be invited into a couple of
// others.
export const MAX_WORKSPACES_PER_USER = 3;
