import "@copilotkit/react-ui/styles.css";

import {
  CopilotKit,
  useDefaultTool,

} from "@copilotkit/react-core";
import { CopilotSidebar, CopilotKitCSSProperties } from "@copilotkit/react-ui";
import { CopilotModalProps } from "@copilotkit/react-ui/dist/components/chat/Modal.js";
import HomePage from "./main";
import gubao from "./assets/gubao.svg";

const copilotKitCSSVariables = `--copilot-kit-primary-color: var(--text);
  --copilot-kit-contrast-color: var(--bg);
  --copilot-kit-background-color: var(--bg);
  --copilot-kit-input-background-color: var(--card);
  --copilot-kit-secondary-color: var(--border);
  --copilot-kit-secondary-contrast-color: rgb(28, 28, 28);
  --copilot-kit-separator-color: var(--primary);
  --copilot-kit-muted-color: rgb(200 200 200);
  --copilot-kit-error-background: #fef2f2;
  --copilot-kit-error-border: #fecaca;
  --copilot-kit-error-text: #dc2626;
  --copilot-kit-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --copilot-kit-shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --copilot-kit-shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --copilot-kit-dev-console-bg: #f8f8fa;
  --copilot-kit-dev-console-text: black;`
  .split("\n")
  .reduce(
    (acc, curr) => {
      const [key, value] = curr.trim().split(":");
      acc[key.trim()] = value.trim();
      return acc;
    },
    {} as Record<string, string>,
  );
export default () => {
  const chatDefaultOpen = false;
  const chatProps: CopilotModalProps = {
    defaultOpen: chatDefaultOpen,

    clickOutsideToClose: false,
    suggestions: [
      {
        title: "什么是基金",
        message: "用通俗易懂的说法解释什么是基金",
      },
      {
        title: "基金有哪些种类",
        message: "基金有哪些分类和种类？他们有什么区别呢",
      },
      {
        title: "如何选购一笔基金",
        message: "我要如何选购一笔基金？可以从哪些方面分析.",
      },
    ],
    imageUploadsEnabled: true,
    icons: {
      openIcon: <img src={gubao.src} alt="gubao" />,
    },
    labels: {
      title: (
        <div style={{ textAlign: "center", alignContent: "center" }}>
          <img
            src={gubao.src}
            alt="gubao"
            style={{ width: "24px", height: "24px", display: "inline-block" }}
          />
          咕宝
        </div>
      ),
      placeholder: "在这里输入你的问题哦~",
      initial: [
        "你好呀，我是咕宝，你的基金智能助手，需要我帮你做什么",
        "我可以为你提供基金相关的信息和建议哦~",
      ],
    },
  };

  return (
    <div style={copilotKitCSSVariables as CopilotKitCSSProperties}>
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        agent="fund_agent"
        showDevConsole={process.env.NODE_ENV === "development"}
        enableInspector={process.env.NODE_ENV === "development"}
      >
        <CopilotSidebar {...chatProps}>
          <HomePage />
        </CopilotSidebar>
      </CopilotKit>
    </div>
  );
};
