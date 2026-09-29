import {
  Alert,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { AccessRequestCard } from './AccessRequestCard.js';
import { useAccessRequests } from './UseAccessRequests.js';

/** One owner workflow; generic controls and layout belong to Mantine. */
export function AccessRequestsPage() {
  const consoleState = useAccessRequests();

  return (
    <Container component="main" size="sm" py={{ base: 'lg', sm: 48 }}>
      <Stack gap="xl">
        <Group component="header" justify="space-between">
          <Text fw={750} size="xl">
            Featherlane
          </Text>
          <Badge variant="light" color="gray">
            Local · synthetic demo
          </Badge>
        </Group>
        <Divider />
        <Stack gap="xs">
          <Title order={1}>Access, with your say.</Title>
          <Text c="dimmed">
            Approve exact account requests. This foundation does not log agents into real websites.
          </Text>
        </Stack>
        <Paper component="section" withBorder p="lg" aria-label="Owner access">
          <Stack>
            <PasswordInput
              label="Owner token"
              autoComplete="off"
              value={consoleState.ownerToken}
              onChange={(event) => consoleState.changeOwnerToken(event.currentTarget.value)}
              placeholder="From your local owner-token.txt"
              description="Stored only in this page’s memory. Never share this token with an agent."
              visibilityToggleButtonProps={{ 'aria-label': 'Toggle token visibility' }}
              visibilityToggleFocusable
            />
            <Group>
              <Button
                loading={consoleState.isBusy}
                disabled={!consoleState.ownerToken || consoleState.isBusy}
                onClick={() => void consoleState.loadAccessRequests()}
              >
                Load requests
              </Button>
              <Button variant="default" onClick={consoleState.lockConsole}>
                Lock console
              </Button>
            </Group>
          </Stack>
        </Paper>
        {consoleState.error && (
          <Alert color="red" title="Request failed" role="alert">
            {consoleState.error}
          </Alert>
        )}
        <Stack
          component="section"
          gap="md"
          aria-labelledby="requests-heading"
          aria-busy={consoleState.isBusy}
        >
          <Group justify="space-between">
            <Title id="requests-heading" order={2} size="h3">
              Requests
            </Title>
            <Text size="sm" c="dimmed">
              {consoleState.hasLoadedRequests
                ? consoleState.accessRequests.length + ' loaded'
                : 'Manual refresh'}
            </Text>
          </Group>
          {!consoleState.accessRequests.length && (
            <Paper withBorder p="xl">
              <Text fw={500}>
                {consoleState.hasLoadedRequests ? 'No requests found' : 'No requests loaded'}
              </Text>
              <Text size="sm" c="dimmed" mt="xs">
                Use the CLI to request staging or production access, then load requests.
              </Text>
            </Paper>
          )}
          {consoleState.accessRequests.map((accessRequest) => (
            <AccessRequestCard
              key={accessRequest.id}
              accessRequest={accessRequest}
              isBusy={consoleState.isBusy}
              onOwnerAction={consoleState.applyOwnerAction}
            />
          ))}
        </Stack>
        <Text component="footer" size="xs" c="dimmed">
          All accounts are fixtures. Approval authorizes this request only; it does not create a
          reusable policy.
        </Text>
      </Stack>
    </Container>
  );
}
