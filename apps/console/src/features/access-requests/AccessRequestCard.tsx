import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { AccessStatus, type Access } from '@featherlane/contracts';
import { OwnerAction } from './OwnerApi.js';

const statusColors: Record<AccessStatus, string> = {
  [AccessStatus.PENDING]: 'yellow',
  [AccessStatus.GRANTED]: 'teal',
  [AccessStatus.DENIED]: 'red',
  [AccessStatus.EXPIRED]: 'gray',
  [AccessStatus.REVOKED]: 'gray',
};

interface AccessRequestCardProps {
  accessRequest: Access;
  isBusy: boolean;
  onOwnerAction: (requestId: string, action: OwnerAction) => Promise<void>;
}

/** Present server state without interpreting agent-supplied purpose as authorization. */
export function AccessRequestCard({
  accessRequest,
  isBusy,
  onOwnerAction,
}: AccessRequestCardProps) {
  const details = [
    ['Agent', accessRequest.actorId],
    ['Destination', accessRequest.origin],
    ['Purpose (agent supplied)', accessRequest.purpose],
    ['Expires', new Date(accessRequest.expiresAt).toLocaleString()],
    ['Request ID', accessRequest.id],
  ];

  return (
    <Card
      component="article"
      withBorder
      padding="lg"
      aria-label={'Request ' + accessRequest.id}
      style={{ overflowWrap: 'anywhere' }}
    >
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={3} size="h4">
            {accessRequest.connectionId}
          </Title>
          <Badge color={statusColors[accessRequest.status]} variant="light">
            {accessRequest.status}
          </Badge>
        </Group>
        <SimpleGrid component="dl" cols={{ base: 1, sm: 2 }} m={0} spacing="md">
          {details.map(([label, value]) => (
            <div key={label}>
              <Text component="dt" size="xs" c="dimmed" fw={600}>
                {label}
              </Text>
              <Text component="dd" size="sm" m={0}>
                {value}
              </Text>
            </div>
          ))}
        </SimpleGrid>
        {accessRequest.status === AccessStatus.PENDING && (
          <Group>
            <Button
              disabled={isBusy}
              onClick={() => void onOwnerAction(accessRequest.id, OwnerAction.APPROVE)}
            >
              Approve once
            </Button>
            <Button
              variant="default"
              disabled={isBusy}
              onClick={() => void onOwnerAction(accessRequest.id, OwnerAction.DENY)}
            >
              Deny
            </Button>
          </Group>
        )}
        {accessRequest.status === AccessStatus.GRANTED && (
          <Group>
            <Button
              color="red"
              variant="light"
              disabled={isBusy}
              onClick={() => void onOwnerAction(accessRequest.id, OwnerAction.REVOKE)}
            >
              Revoke grant
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  );
}
