import React, {Component} from "react";
import "./AppOrderSummary.scss";
import {PropTypes} from "prop-types";
import LoadingButton from "../LoadingButton";
import {Form} from "react-bootstrap";

class AppOrderSummary extends Component {
  constructor(props, context) {
    super(props, context);

    this.handleChange = this.handleChange.bind(this);

    this.state = {
      maxBalance: 0,
      data: {
        balanceInput: 0,
      },
    };
  }

  handleChange({currentTarget: input}) {
    // let value = input.value;

    const {maxBalance} = this.state;
    const data = {...this.state.data};

    // if (input.value.length === 0)

    data[input.name] = input.value;
    if (input.value >= 0 && input.value <= maxBalance) {
      this.setState({data});
    } else if (input.value.length === 0) {
      data[input.name] = 0;
      this.setState({data});
    }
  }

  componentDidMount() {
    const {balance} = this.props;

    this.setState({maxBalance: balance, data: {balanceInput: balance}});
  }

  render() {
    const {balanceInput} = this.state.data;
    const {maxBalance} = this.state;

    const {
      formActionHandler,
      actionButtonName,
      items,
      balanceOnChange,
      loading,
      total,
      currency,
    } = this.props;

    return (
      <div className="summary">
        {items.map((it, idx) => (
          <div className="item" key={idx}>
            <span>{it.label}</span>
            <span>{it.quantity}</span>
          </div>
        ))}
        <div className="item current-balance">
          <span>Current balance</span>
          <span className="currency-wrapper">
            <span className="currency">{currency}</span>
            <Form.Control
              disabled={maxBalance === 0}
              type="number"
              min={0}
              max={maxBalance}
              name="balanceInput"
              value={balanceInput}
              onChange={(e) => {
                this.handleChange(e);
                balanceOnChange(e);
              }}
            />
          </span>
        </div>
        <hr />
        <div className="item total">
          <span>Total cost</span>
          <span>{total} USD</span>
        </div>
        <LoadingButton
          loading={loading}
          buttonProps={{
            onClick: formActionHandler,
            variant: "primary",
            className: "action",
          }}
        >
          <span>{actionButtonName}</span>
        </LoadingButton>
      </div>
    );
  }
}

AppOrderSummary.defaultProps = {
  actionButtonName: "Check Out",
};

AppOrderSummary.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string,
      quantity: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    })
  ),
  formActionHandler: PropTypes.func,
  actionButtonName: PropTypes.string,
  total: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  balance: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  balanceOnChange: PropTypes.func,
  loading: PropTypes.bool,
  currency: PropTypes.string,
};

export default AppOrderSummary;
