function shotKey(id) {
  return `shot:${id}`;
}

function cropKey(id) {
  return `crop:${id}`;
}

function secretKey(id) {
  return `key:${id}`;
}

function grantKey(id) {
  return `grant:${id}`;
}

function issueIndexKey(issueId) {
  return `issue:${issueId}:shots`;
}

module.exports = {
  shotKey,
  cropKey,
  secretKey,
  grantKey,
  issueIndexKey,
};
