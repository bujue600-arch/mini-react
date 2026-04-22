// 创建VDOM
function createTextNode(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map((child) => {
        return typeof child === "string" ? createTextNode(child) : child;
      }),
    },
  };
}

// 初次渲染
// render函数将VDOM递归渲染成真实DOM,三步走:
function render(el, container) {

  // 第一步：创建真实节点
  const dom =
    el.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(el.type);

  // 第二步：遍历props（id、class...）
  Object.keys(el.props).forEach((key) => {
    //children 被排除，因为它是VDOM结构，不是DOM属性。
    if (key !== "children") {
      dom[key] = el.props[key];
    }
  });

  const children = el.props.children;
  children.forEach((child) => {
    render(child, dom);
  });

  // 第三步：
  container.append(dom);
}

const React = {
  render,
  createElement,
};

export default React
