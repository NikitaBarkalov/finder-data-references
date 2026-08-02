export const buildRobustRegex = (text: string, isDoi: boolean = false) => {
  const escapedCharacters = text.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const coreRegexStr = escapedCharacters.join('[\\s-]*');
  if (isDoi) {
    const prefixes = [
      'https://doi.org/',
      'http://doi.org/',
      'https://dx.doi.org/',
      'http://dx.doi.org/',
      'doi.org/',
      'doi:',
      'doi',
    ];
    const mapped = prefixes.map((prefix) => {
      return prefix
        .split('')
        .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[\\s-]*');
    });
    const prefixRegexStr = '(?:(?:' + mapped.join(')|(?:') + '))?[\\s-]*';
    return new RegExp(prefixRegexStr + coreRegexStr, 'gi');
  }
  return new RegExp(coreRegexStr, 'gi');
};
