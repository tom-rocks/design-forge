import { createTheme } from "@mantine/core";

const alertColorMap = {
    error: {
        borderColor: "#F8D5D5",
        color: "#450B0B",
    },
    warning: {
        borderColor: "#FFE9C5",
        color: "#6B470B",
    },
};

export const theme = createTheme({
    defaultRadius: "md",
    cursorType: "pointer",
    radius: {
        xs: "3px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "12px",
    },
    primaryShade: 5,
    primaryColor: "primary",
    colors: {
        primary: [
            "#EBF1FD", // 50
            "#D7E3FC", // 100
            "#AFC6F8", // 200
            "#88AAF5", // 300
            "#608DF1", // 400
            "#2464F1", // 500
            "#1650CF", // 600
            "#1442A7", // 700
            "#0B2866", // 800
            "#071D4A", // 900
        ],
        success: [
            "#E8F6ED", // 50
            "#D1EEDB", // 100
            "#BAE5C8", // 200
            "#8CD4A4", // 300
            "#5EC37F", // 400
            "#01A63E", // 500
            "#307F4A", // 600
            "#21713B", // 700
            "#1B4729", // 800
            "#102A19", // 900
        ],
        error: [
            "#FCEAEA", // 50
            "#F8D5D5", // 100
            "#F1ABAB", // 200
            "#EB8282", // 300
            "#E45858", // 400
            "#E73F3F", // 500
            "#A11A1A", // 600
            "#920E0E", // 700
            "#450B0B", // 800
            "#170404", // 900
        ],
        warning: [
            "#FFF0D8", // 50
            "#FFE9C5", // 100
            "#FFDB9E", // 200
            "#FFD38B", // 300
            "#FFC564", // 400
            "#F4A118", // 500
            "#E49614", // 600
            "#B6760E", // 700
            "#6B470B", // 800
            "#3C2604", // 900
        ],
        violet: [
            "#F3F0FF", // 50
            "#E6E0FF", // 100
            "#D0BFFF", // 200
            "#B392FF", // 300
            "#9C6FFF", // 400
            "#7A3EEA", // 500
            "#6A32E6", // 600
            "#4C21C7", // 700
            "#31158A", // 800
            "#1F0A4C", // 900
        ],
        teal: [
            "#E0F5F4", // 50
            "#BFECE9", // 100
            "#7ED8D0", // 200
            "#3EBEB2", // 300
            "#00A99D", // 400
            "#008A83", // 500
            "#00726C", // 600
            "#005A54", // 700
            "#00403A", // 800
            "#002A27", // 900
        ],
        gray: [
            "#EFEFEF", // 50
            "#E6E6E6", // 100
            "#E0E0E0", // 200
            "#DBDBDB", // 300
            "#CBCBCB", // 400
            "#A1A0A3", // 500
            "#727279", // 600
            "#5A5C60", // 700
            "#404040", // 800
            "#222124", // 900
        ],
        background: ["#F5F5F7", "#F9FAFB", "#F6F6F6", "#f0f0f0"],

        rarities: ["#615F71", "#00B072", "#008BE8", "#9374FD", "#FCBE23", "#54497F"],
    },
    shadows: {
        xs: "0px 3px 4px -5px rgba(24, 24, 28, 0.03), 0px 1px 2px rgba(24, 24, 28, 0.04);",
        sm: "0px 0px 2px rgba(24, 24, 28, 0.02), 0px 1px 2px rgba(24, 24, 28, 0.06);",
        md: "0px 1px 1px rgba(24, 24, 28, 0.04), 0px 3px 4px rgba(24, 24, 28, 0.04);",
        lg: "0px 2px 4px -2px rgba(24, 24, 28, 0.06), 0px 4px 8px -2px rgba(24, 24, 28, 0.1);",
        xl: "0px 2px 6px rgba(24, 24, 28, 0.06), 0px 32px 41px -23px rgba(24, 24, 28, 0.07);",
    },
    spacing: {
        xs: "8px",
    },
    fontFamily: "Inter, sans-serif",
    headings: {
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        sizes: {
            h1: {
                fontSize: "32px",
                lineHeight: "40px",
            },
            h6: {
                fontSize: "14px",
                lineHeight: "20px",
            },
        },
    },
    components: {
        Accordion: {
            defaultProps: {},
            variants: {
                contained: (theme) => ({
                    item: {
                        backgroundColor: "white",
                        "&[data-active]": {
                            backgroundColor: "white",
                        },
                        borderColor: theme.colors.gray[1],
                    },

                    control: {
                        padding: "0 12px 0 0",
                        "&:hover": {
                            backgroundColor: "white",
                        },
                    },
                    label: {
                        padding: "8px 12px",
                    },
                    content: {
                        padding: "8px 12px",
                    },
                }),
            },
        },
        ActionIcon: {
            sizes: {
                md: () => ({
                    root: {
                        height: "24px",
                        "& svg": {
                            width: 16,
                            height: 16,
                        },
                    },
                }),
                xl: () => ({
                    root: {
                        width: 40,
                        minWidth: 40,
                        minHeight: 40,
                        height: 40,
                        "& svg": {
                            width: 20,
                            height: 20,
                        },
                    },
                }),
            },
            defaultProps: {
                size: "md",
                radius: "md",
            },
            styles: (theme, params) => {
                return {
                    root: {
                        color: params.variant === "default" ? theme.colors.gray[5] : undefined,
                    },
                };
            },
            variants: {
                borders: (theme) => ({
                    root: {
                        backgroundColor: "white",
                        border: "1px solid",
                        borderColor: theme.colors.gray[1],
                        color: theme.colors.gray[9],
                        boxShadow: theme.shadows.xs,
                        "&:hover": {
                            borderColor: theme.colors.gray[2],
                        },
                        "&[data-loading]": {
                            opacity: 1,
                            borderColor: theme.colors.gray[0],
                            backgroundColor: theme.colors.gray[0],
                            color: theme.colors.gray[4],
                            "&:before": {
                                content: "initial",
                            },
                            "& svg": {
                                stroke: theme.colors.gray[4],
                            },
                        },
                    },
                }),
            },
        },
        Anchor: {
            defaultProps: {
                color: "primary.5",
                weight: 500,
            },
            styles: (theme) => {
                return {
                    root: {
                        "&:hover": {
                            // TODO remove it when bulma is removed
                            // generic.sass
                            color: theme.colors.primary[5],
                        },
                    },
                };
            },
        },
        Alert: {
            styles: (theme, params) => {
                return {
                    root: {
                        padding: 16,
                        border: "1px solid",
                        borderColor: alertColorMap[params.color]?.borderColor,
                    },
                    title: {
                        marginBottom: 4,
                    },
                    message: {
                        color: alertColorMap[params.color]?.color,
                    },
                };
            },
        },
        Avatar: {
            defaultProps: {
                size: "md",
            },
            sizes: {
                md: () => ({
                    root: {
                        height: "44px",
                        width: "44px",
                    },
                }),
            },

            styles: (theme) => {
                return {
                    root: {
                        padding: 2,
                        backgroundColor: theme.colors.gray[1],
                        transform: "scale(-1, 1)",
                    },
                    placeholder: {
                        border: 0,
                        backgroundColor: theme.colors.gray[1],
                    },
                };
            },
        },
        Badge: {
            defaultProps: {
                size: "xs",
                radius: "sm",
                color: "gray",
                variant: "outline",
            },
            sizes: {
                xxs: () => ({
                    root: {
                        height: "18px",
                        paddingInline: "4px",
                        paddingBlock: "1px",
                        borderRadius: "4px",
                    },
                    inner: {
                        fontSize: 9,
                        textTransform: "uppercase",
                        fontWeight: 700,
                    },
                }),
                xs: () => ({
                    root: {
                        height: "24px",
                    },
                }),
                sm: () => ({
                    root: {
                        height: "28px",
                    },
                }),
                md: () => ({
                    root: {
                        height: "32px",
                    },
                }),
                lg: () => ({
                    root: {
                        height: "36px",
                    },
                }),
                xl: () => ({
                    root: {
                        height: "40px",
                    },
                }),
            },
            variants: {
                outline: () => ({
                    root: {
                        boxShadow: "sm",
                        backgroundColor: "#ffffff",
                        borderColor: "#E6E6E6",
                        color: "#222124",
                    },
                }),
            },
            styles: () => {
                return {
                    root: {
                        textTransform: "capitalize",
                        fontSize: 12,
                        fontWeight: 500,
                    },
                };
            },
        },
        Button: {
            sizes: {
                xs: () => ({
                    root: {
                        height: "32px",
                        borderRadius: "6px",
                    },
                }),
                sm: () => ({
                    root: {
                        height: "36px",
                    },
                }),
                md: () => ({
                    root: {
                        height: "40px",
                    },
                }),
                lg: () => ({
                    root: {
                        height: "44px",
                    },
                }),
                xl: () => ({
                    root: {
                        height: "48px",
                    },
                }),
                xxl: () => ({
                    root: {
                        height: "56px",
                        paddingInline: 24,
                        fontSize: 18,
                    },
                }),
            },
            variants: {
                borders: (theme) => ({
                    root: {
                        backgroundColor: "white",
                        border: "1px solid",
                        borderColor: theme.colors.gray[2],
                        color: theme.colors.gray[9],
                        boxShadow: theme.shadows.xs,
                        "&:hover": {
                            borderColor: theme.colors.gray[2],
                        },
                        "&[data-loading]": {
                            opacity: 1,
                            borderColor: theme.colors.gray[0],
                            backgroundColor: theme.colors.gray[0],
                            color: theme.colors.gray[4],
                            "&:before": {
                                content: "initial",
                            },
                            "& svg": {
                                stroke: theme.colors.gray[4],
                            },
                        },
                    },
                }),
            },
            defaultProps: {
                size: "md",
            },
            styles: (theme, params) => ({
                root: {
                    color:
                        params.variant === "subtle" && params.color === "gray"
                            ? "#727279"
                            : undefined,
                },
            }),
        },
        Card: {
            defaultProps: {
                shadow: "sm",
            },
            styles: (theme) => ({
                root: {
                    overflow: "initial",
                    position: "initial",
                    "&[data-with-border]": {
                        borderColor: theme.colors.gray[1],
                    },
                },
            }),
        },
        Container: {
            defaultProps: {
                sizes: {
                    xs: 540,
                    sm: 720,
                    md: 960,
                    lg: 1140,
                    xl: 1432,
                },
                size: "xl",
                px: 32,
            },
        },
        Checkbox: {
            defaultProps: {
                size: "md",
                radius: "xs",
            },
            sizes: {
                md: (theme) => ({
                    label: {
                        fontSize: 14,
                    },
                    body: {
                        alignItems: "center",
                    },
                    inner: {
                        height: 18,
                        width: 18,
                    },
                    input: {
                        height: 18,
                        width: 18,
                        "&:hover": {
                            borderColor: theme.colors.primary[5],
                            backgroundColor: theme.colors.primary[1],
                            "&:checked": {
                                backgroundColor: theme.colors.primary[5],
                            },
                        },
                    },
                    description: {
                        marginTop: 0,
                    },
                }),
            },
        },
        DateTimePicker: {
            defaultProps: {
                size: "sm",
                popoverProps: {
                    shadow: "xs",
                },
            },
            sizes: {
                sm: () => ({
                    input: {
                        height: "40px",
                    },
                }),
            },
            styles: () => ({
                dropdown: {
                    borderColor: "#EFEFEF",
                },
            }),
        },
        Divider: {
            defaultProps: {
                color: "gray.1",
                labelProps: {
                    size: "sm",
                    color: "gray.6",
                },
            },
            styles: () => ({
                label: {
                    marginTop: "0 !important",
                },
            }),
        },
        Dialog: {
            styles: (theme) => ({
                root: {
                    boxShadow: theme.shadows.xl,
                },
            }),
        },
        Drawer: {
            sizes: {
                lg: () => ({
                    content: {
                        flexBasis: 572,
                    },
                }),
            },
            defaultProps: {
                position: "right",
                overlayProps: {
                    color: "#1F2022",
                    opacity: 0.5,
                },
            },
            styles: (theme) => ({
                content: {
                    borderBottomLeftRadius: theme.radius.md,
                    borderTopLeftRadius: theme.radius.md,
                    backgroundColor: theme.colorScheme === "dark" ? theme.colors.dark[8] : "#fff",
                },
            }),
        },
        Dropzone: {
            styles: (theme) => ({
                root: {
                    borderColor: theme.colors.gray[3],
                    "&:hover": {
                        backgroundColor: theme.colors.background[1],
                    },
                    "&[data-accept]": {
                        borderColor: theme.colors.primary[5],
                    },
                },
            }),
        },
        Input: {
            defaultProps: {
                size: "md",
            },
            styles: (theme) => {
                return {
                    input: {
                        fontSize: 14,
                        color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#222124",
                        borderColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[6] : "#E0E0E0",
                        backgroundColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[8] : "#fff",

                        boxShadow: theme.shadows.xs,
                        "&:focus": {
                            outline: `3px solid ${theme.colors.primary[1]}`,
                        },
                    },
                };
            },
        },

        InputWrapper: {
            defaultProps: {
                size: "md",
                labelProps: {
                    size: "sm",
                },
            },
            styles: (theme) => ({
                label: {
                    fontWeight: 500,
                    color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#5A5C60",
                    marginBottom: 4,
                },
            }),
        },
        Menu: {
            defaultProps: {
                withinPortal: true,
                transitionProps: {
                    duration: 100,
                },
            },
            styles: (theme) => {
                return {
                    dropdown: {
                        padding: "8px !important",
                        borderColor: theme.colors.gray[0],
                    },
                    divider: {
                        borderColor: theme.colors.gray[0],
                    },
                    item: {
                        color: theme.colors.gray[9],

                        "&:hover": {
                            backgroundColor: theme.colors.background[2],
                        },
                    },
                };
            },
        },
        Modal: {
            defaultProps: {
                padding: "20px 24px",
                overlayProps: {
                    color: "#1F2022",
                    opacity: 0.5,
                },
            },
            styles: (theme) => {
                return {
                    title: {
                        fontSize: 18,
                        fontWeight: 600,
                        color:
                            theme.colorScheme === "dark"
                                ? theme.colors.dark[0]
                                : theme.colors.gray[9],
                    },
                    close: {
                        alignSelf: "self-start",
                    },
                    header: {
                        minHeight: 64,
                        backgroundColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[8] : "#fff",
                    },
                };
            },
        },
        MultiSelect: {
            styles: () => {
                return {
                    item: { fontSize: 14 },
                };
            },
        },
        NavLink: {
            styles: (theme) => {
                return {
                    root: {
                        padding: "4px 10px",
                        fontSize: 14,
                        minHeight: 36,
                        borderRadius: theme.radius.sm,
                        display: "flex",
                        alignItems: "center",
                        fontWeight: 500,
                        flexShrink: 0,

                        "&.active": {
                            "&, &:hover": {
                                backgroundColor: theme.colors.primary[0],
                                color: theme.colors.gray[9],
                            },
                            ".mantine-Text-root": {
                                color: theme.colors.gray[9],
                            },
                        },

                        "&:hover": {
                            backgroundColor: theme.colors.background[2],
                        },
                    },
                };
            },
        },
        Kbd: {
            defaultProps: {
                size: "xs",
            },
            styles: () => {
                return {
                    root: {
                        backgroundColor: "#ffffff",
                        borderColor: "#E6E6E6",
                        borderBottom: "0.0625rem solid #E6E6E6",
                        borderRadius: "4px",
                    },
                };
            },
        },
        Skeleton: {
            styles: {
                root: {
                    backgroundColor: "#EFEFEF",
                    "&:after": {
                        background: "#E6E6E6 !important",
                    },
                },
            },
        },
        Spotlight: {
            styles: {
                root: {
                    ".mantine-Input-icon": {
                        color: "#727279",
                    },
                },
                actions: {
                    borderColor: "#E6E6E6",
                    padding: "0 16px 16px",
                },
                searchInput: {
                    color: "#222124",
                },
                nothingFound: {
                    fontSize: 14,
                    paddingBottom: "0 !important",
                },
                action: {
                    color: "#222124",
                },
                actionsGroup: {
                    color: "#727279",
                    textTransform: "capitalize",
                    fontSize: 12,
                    fontWeight: 400,
                },
            },
        },
        Radio: {
            defaultProps: {
                transitionDuration: 100,
            },
        },
        RadioGroup: {
            defaultProps: {
                size: "xs",
            },
        },
        Select: {
            sizes: {
                xs: () => ({
                    input: {
                        minHeight: "32px",
                        height: "32px",
                    },
                }),
                sm: () => ({
                    input: {
                        minHeight: "36px",
                        height: "36px",
                    },
                }),
                md: () => ({
                    input: {
                        minHeight: "40px",
                        height: "40px",
                    },
                }),
                lg: () => ({
                    input: {
                        minHeight: "44px",
                        height: "44px",
                    },
                }),
                xl: () => ({
                    input: {
                        minHeight: "48px",
                        height: "48px",
                    },
                }),
            },

            defaultProps: {
                withinPortal: true,
                maxDropdownHeight: 400,
                size: "md",
                shadow: "xl",
            },
            styles: (theme) => {
                return {
                    dropdown: {
                        zIndex: 1001,
                        padding: "6px !important",
                        borderColor:
                            theme.colorScheme === "dark"
                                ? theme.colors.dark[6]
                                : theme.colors.gray[0],
                        backgroundColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[8] : "#fff",
                    },
                    input: {
                        borderColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[6] : "#E0E0E0",
                        backgroundColor:
                            theme.colorScheme === "dark" ? theme.colors.dark[8] : "#fff",
                    },
                    itemsWrapper: {
                        padding: 0,
                        gap: 4,
                    },
                    item: {
                        padding: "4px 8px",
                        color:
                            theme.colorScheme === "dark"
                                ? theme.colors.dark[0]
                                : theme.colors.gray[9],
                        fontSize: 14,
                        minHeight: 36,
                        display: "flex",
                        alignItems: "center",
                        fontWeight: 500,

                        "&[data-selected]": {
                            "&, &:hover": {
                                backgroundColor:
                                    theme.colorScheme === "dark"
                                        ? theme.colors.dark[6]
                                        : theme.colors.gray[0],
                                color:
                                    theme.colorScheme === "dark"
                                        ? theme.colors.dark[0]
                                        : theme.colors.gray[9],
                            },
                        },

                        "&[data-disabled]": {
                            "& *, &:hover": {
                                color:
                                    theme.colorScheme === "dark"
                                        ? theme.colors.dark[0]
                                        : theme.colors.gray[3],
                                cursor: "not-allowed",
                            },
                        },

                        "&[data-hovered]": {
                            backgroundColor:
                                theme.colorScheme === "dark"
                                    ? theme.colors.dark[6]
                                    : theme.colors.background[2],
                        },
                    },
                    separator: {
                        padding: "0 10px",
                        marginTop: "8px",
                        marginBottom: "-4px",
                    },
                    separatorLabel: {
                        color: `${theme.colors.gray[6]} !important`,
                        lineHeight: "1.2",
                        fontWeight: 500,
                        "&:after": {
                            borderColor: theme.colors.gray[3],
                        },
                    },
                };
            },
        },
        Switch: {
            defaultProps: {
                size: "md",
                radius: "xl",
            },
            styles: (theme) => {
                return {
                    track: {
                        width: 44,
                    },
                };
            },
        },
        Text: {
            defaultProps: (theme) => ({
                color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#5A5C60",
            }),

            variants: {
                data: (theme) => ({
                    root: {
                        color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#222124",
                        fontSize: 14,
                        fontWeight: 500,
                    },
                }),
            },
        },
        Table: {
            defaultProps: {
                verticalSpacing: "sm",
                horizontalSpacing: "md",
            },
            styles: (theme) => {
                return {
                    root: {
                        boxShadow: theme.shadows.sm,
                        borderRadius: theme.radius.sm,
                        overflow: "hidden",
                        color: theme.colors.gray[9],
                        background: "#fff",

                        "thead tr th": {
                            color: theme.colors.gray[6],
                            backgroundColor: theme.colors.gray[0],
                            borderBottomColor: theme.colors.gray[0],
                            fontWeight: 500,
                        },

                        "tbody tr td": {
                            borderTopColor: theme.colors.gray[0],
                            verticalAlign: "middle",
                            height: 53,
                        },
                    },
                };
            },
        },
        Tabs: {
            variants: {
                borders: (theme) => ({
                    tabsList: {
                        gap: 4,
                    },
                    tab: {
                        minHeight: 42,
                        fontSize: 15,
                        backgroundColor: "white",
                        border: "1px solid",
                        borderColor: theme.colors.gray[1],
                        color: theme.colors.gray[8],
                        boxShadow: theme.shadows.xs,
                        borderRadius: theme.radius.md,
                        padding: "11px 16px",
                        "&:hover": {
                            borderColor: theme.colors.primary[5],
                        },
                        "&:focus": {
                            borderColor: theme.colors.primary[5],
                            outline: `3px solid ${theme.colors.primary[1]}`,
                            outlineOffset: "0 !important",
                        },

                        //   active
                        "&[data-active]": {
                            borderColor: theme.colors.primary[5],
                            color: theme.colors.gray[9],
                        },
                    },
                }),
            },
        },

        TextInput: {
            sizes: {
                xs: () => ({
                    input: {
                        minHeight: "32px",
                        height: "32px",
                    },
                }),
                sm: () => ({
                    input: {
                        minHeight: "36px",
                        height: "36px",
                    },
                }),
                md: () => ({
                    input: {
                        minHeight: "40px",
                        height: "40px",
                    },
                }),
                lg: () => ({
                    input: {
                        minHeight: "44px",
                        height: "44px",
                    },
                }),
                xl: () => ({
                    input: {
                        minHeight: "48px",
                        height: "48px",
                    },
                }),
            },

            defaultProps: {
                size: "md",
            },
        },

        Tooltip: {
            defaultProps: {
                withinPortal: true,
                withArrow: true,
                arrowSize: 8,
            },
            styles: (theme) => {
                return {
                    tooltip: {
                        ...(theme.colorScheme === "dark" && {
                            backgroundColor: theme.colors.dark[6],
                            color: theme.colors.dark[0],
                            boxShadow: theme.shadows.md,
                        }),
                    },
                };
            },
        },

        Title: {
            defaultProps: {
                color: "#222124",
            },
            styles: (theme) => {
                return {
                    root: {
                        color: theme.colorScheme === "dark" ? theme.colors.dark[0] : "#222124",
                    },
                };
            },
        },

        ThemeIcon: {
            variants: {
                default: (theme) => ({
                    root: {
                        background: "none",
                        border: 0,
                        color: theme.colors.gray[4],
                    },
                }),
            },
            defaultProps: {
                color: "gray.4",
                variant: "default",
            },
        },
        Timeline: {
            defaultProps: {
                bulletSize: 24,
                lineWidth: 2,
            },
            variants: {
                condense: (theme) => ({
                    itemBullet: {
                        // backgroundColor: theme.colors.primary[5],
                    },
                    item: {
                        ":not(:first-of-type)": {
                            marginTop: "1rem",
                        },

                        "&:before": {
                            top: "1.625rem !important",
                            bottom: "calc(0.5rem * -0.8) !important",
                        },
                    },
                }),
            },
            styles: (theme) => {
                return {
                    item: {
                        "&:before": {
                            top: "1.875rem",
                            bottom: "calc(1.5rem * -0.8)",
                            borderColor: theme.colors.gray[2],
                        },
                    },
                    itemBullet: {
                        "&[data-with-child]": {
                            border: 0,
                            backgroundColor: theme.colors.gray[4],
                            color: "#fff",
                        },
                    },
                };
            },
        },
    },
});
