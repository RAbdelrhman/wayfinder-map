import { useLocalSearchParams } from 'expo-router';
import { PublicMapsScreen } from '../maps/PublicMapsScreen';

export default function PublicMapsRoute() {
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  return <PublicMapsScreen key={shared ?? ''} />;
}
