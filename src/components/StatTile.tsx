import { Card } from "@astryxdesign/core/Card";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

type StatTileVariant = "default" | "green" | "yellow" | "muted" | "red";

export function StatTile({
  label,
  value,
  variant = "default",
  size = "2xl",
}: {
  label: string;
  value: number | string;
  variant?: StatTileVariant;
  size?: "2xl" | "3xl";
}) {
  return (
    <Card variant={variant}>
      <VStack gap={1} align="start">
        <Text type="supporting">{label}</Text>
        <Text size={size} weight="semibold">
          {value}
        </Text>
      </VStack>
    </Card>
  );
}
