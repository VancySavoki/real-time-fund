import packageJson from '../../package.json';

export const fetchLatestRelease = async () => {
  const response = await fetch('https://api.github.com/repos/wp0630/real-time-fund/releases/latest');
  if (!response.ok) {
    throw new Error('Failed to fetch latest release');
  }
  return response.json();
};

export const checkForUpdate = async () => {
  try {
    const data = await fetchLatestRelease();
    if (!data?.tag_name) return { hasUpdate: false };

    const remoteVersion = data.tag_name.replace(/^v/, '');
    const currentVersion = packageJson.version;

    if (remoteVersion !== currentVersion) {
      return {
        hasUpdate: true,
        version: remoteVersion,
        content: data.body || '',
      };
    }
    return { hasUpdate: false };
  } catch (error) {
    console.error('Check update failed:', error);
    return { hasUpdate: false, error: error.message };
  }
};
