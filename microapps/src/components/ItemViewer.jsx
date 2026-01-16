import React, { useState } from "react";
import {
    Container,
    Paper,
    TextInput,
    Button,
    Stack,
    Title,
    Text,
    Card,
    Badge,
    Group,
    LoadingOverlay,
    Alert,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useItemQuery } from "../api/items.query.js";

/**
 * ItemViewer Component
 * Displays a form to input disp_id and shows the fetched item data
 */
export const ItemViewer = () => {
    const [dispId, setDispId] = useState("");
    const { data, isLoading, error, refetch } = useItemQuery(dispId);

    // Form validation schema
    const schema = z.object({
        dispId: z.string().min(1, "Display ID is required"),
    });

    // Form setup
    const form = useForm({
        initialValues: {
            dispId: "",
        },
        validate: zodResolver(schema),
    });

    // Handle form submission
    const handleSubmit = (values) => {
        setDispId(values.dispId.trim());
    };

    // Handle manual refetch
    const handleRefetch = () => {
        if (dispId) {
            refetch();
        }
    };

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <Title order={1}>Item Viewer</Title>

                {/* Input Form */}
                <Paper p="md" withBorder>
                    <form onSubmit={form.onSubmit(handleSubmit)}>
                        <Stack gap="md">
                            <TextInput
                                label="Display ID"
                                placeholder="Enter item display ID"
                                description="Enter the disp_id to fetch item details"
                                {...form.getInputProps("dispId")}
                                required
                            />
                            <Group>
                                <Button type="submit" loading={isLoading}>
                                    Fetch Item
                                </Button>
                                {data && (
                                    <Button variant="outline" onClick={handleRefetch} loading={isLoading}>
                                        Refresh
                                    </Button>
                                )}
                            </Group>
                        </Stack>
                    </form>
                </Paper>

                {/* Error Display */}
                {error && (
                    <Alert title="Error" color="red" variant="light">
                        {error.message}
                    </Alert>
                )}

                {/* Loading State */}
                {isLoading && dispId && (
                    <Paper p="md" withBorder pos="relative">
                        <LoadingOverlay visible />
                        <Text>Loading item data...</Text>
                    </Paper>
                )}

                {/* Data Display */}
                {data && !isLoading && (
                    <Stack gap="md">
                        <Title order={2}>Item Details</Title>

                        {/* Item Data */}
                        <Card withBorder>
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Title order={3}>Item Data</Title>
                                    {data.read_only && (
                                        <Badge color="yellow" variant="light">
                                            Read Only
                                        </Badge>
                                    )}
                                </Group>
                                <Paper p="sm" withBorder>
                                    <pre style={{ overflow: "auto", maxHeight: "300px" }}>
                                        {JSON.stringify(data.item, null, 2)}
                                    </pre>
                                </Paper>
                            </Stack>
                        </Card>

                        {/* Metadata */}
                        {Object.keys(data.metadata).length > 0 && (
                            <Card withBorder>
                                <Stack gap="md">
                                    <Title order={3}>Metadata</Title>
                                    <Paper p="sm" withBorder>
                                        <pre style={{ overflow: "auto", maxHeight: "200px" }}>
                                            {JSON.stringify(data.metadata, null, 2)}
                                        </pre>
                                    </Paper>
                                </Stack>
                            </Card>
                        )}

                        {/* Users */}
                        {Object.keys(data.users).length > 0 && (
                            <Card withBorder>
                                <Stack gap="md">
                                    <Title order={3}>Users</Title>
                                    <Paper p="sm" withBorder>
                                        <pre style={{ overflow: "auto", maxHeight: "200px" }}>
                                            {JSON.stringify(data.users, null, 2)}
                                        </pre>
                                    </Paper>
                                </Stack>
                            </Card>
                        )}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}; 