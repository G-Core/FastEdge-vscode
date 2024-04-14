package main

import (
	"github.com/google/go-dap"
)

func (ds *fakeDebugSession) onAttachRequest(request *dap.AttachRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "AttachRequest is not implemented"))
}

func (ds *fakeDebugSession) onTerminateRequest(request *dap.TerminateRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "TerminateRequest is not implemented"))
}

func (ds *fakeDebugSession) onRestartRequest(request *dap.RestartRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "RestartRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetFunctionBreakpointsRequest(request *dap.SetFunctionBreakpointsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SetFunctionBreakpointsRequest is not implemented"))
}

func (ds *fakeDebugSession) onNextRequest(request *dap.NextRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "NextRequest is not implemented"))
}

func (ds *fakeDebugSession) onStepInRequest(request *dap.StepInRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "StepInRequest is not implemented"))
}

func (ds *fakeDebugSession) onStepOutRequest(request *dap.StepOutRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "StepOutRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetBreakpointsRequest(request *dap.SetBreakpointsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SetBreakpointsRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetExceptionBreakpointsRequest(request *dap.SetExceptionBreakpointsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SetExceptionBreakpointsRequest is not implemented"))
}

func (ds *fakeDebugSession) onStepBackRequest(request *dap.StepBackRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "StepBackRequest is not implemented"))
}

func (ds *fakeDebugSession) onReverseContinueRequest(request *dap.ReverseContinueRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ReverseContinueRequest is not implemented"))
}

func (ds *fakeDebugSession) onRestartFrameRequest(request *dap.RestartFrameRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "RestartFrameRequest is not implemented"))
}

func (ds *fakeDebugSession) onGotoRequest(request *dap.GotoRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "GotoRequest is not implemented"))
}

func (ds *fakeDebugSession) onStackTraceRequest(request *dap.StackTraceRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "StackTraceRequest is not implemented"))
}

func (ds *fakeDebugSession) onScopesRequest(request *dap.ScopesRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ScopesRequest is not implemented"))
}

func (ds *fakeDebugSession) onVariablesRequest(request *dap.VariablesRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "VariablesRequest is not implemented"))
}

func (ds *fakeDebugSession) onThreadsRequest(request *dap.ThreadsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ThreadsRequest is not implemented"))
}

func (ds *fakeDebugSession) onPauseRequest(request *dap.PauseRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "PauseRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetVariableRequest(request *dap.SetVariableRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "setVariableRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetExpressionRequest(request *dap.SetExpressionRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SetExpressionRequest is not implemented"))
}

func (ds *fakeDebugSession) onSourceRequest(request *dap.SourceRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SourceRequest is not implemented"))
}

func (ds *fakeDebugSession) onTerminateThreadsRequest(request *dap.TerminateThreadsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "TerminateRequest is not implemented"))
}

func (ds *fakeDebugSession) onEvaluateRequest(request *dap.EvaluateRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "EvaluateRequest is not implemented"))
}

func (ds *fakeDebugSession) onStepInTargetsRequest(request *dap.StepInTargetsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "StepInTargetRequest is not implemented"))
}

func (ds *fakeDebugSession) onGotoTargetsRequest(request *dap.GotoTargetsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "GotoTargetRequest is not implemented"))
}

func (ds *fakeDebugSession) onCompletionsRequest(request *dap.CompletionsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "CompletionRequest is not implemented"))
}

func (ds *fakeDebugSession) onExceptionInfoRequest(request *dap.ExceptionInfoRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ExceptionRequest is not implemented"))
}

func (ds *fakeDebugSession) onLoadedSourcesRequest(request *dap.LoadedSourcesRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "LoadedRequest is not implemented"))
}

func (ds *fakeDebugSession) onDataBreakpointInfoRequest(request *dap.DataBreakpointInfoRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "DataBreakpointInfoRequest is not implemented"))
}

func (ds *fakeDebugSession) onSetDataBreakpointsRequest(request *dap.SetDataBreakpointsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "SetDataBreakpointsRequest is not implemented"))
}

func (ds *fakeDebugSession) onReadMemoryRequest(request *dap.ReadMemoryRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ReadMemoryRequest is not implemented"))
}

func (ds *fakeDebugSession) onDisassembleRequest(request *dap.DisassembleRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "DisassembleRequest is not implemented"))
}

func (ds *fakeDebugSession) onCancelRequest(request *dap.CancelRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "CancelRequest is not implemented"))
}

func (ds *fakeDebugSession) onBreakpointLocationsRequest(request *dap.BreakpointLocationsRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "BreakpointLocationsRequest is not implemented"))
}

func (ds *fakeDebugSession) onConfigurationDoneRequest(request *dap.ConfigurationDoneRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ConfigurationDoneRequest is not implemented"))
}

func (ds *fakeDebugSession) onContinueRequest(request *dap.ContinueRequest) {
	ds.send(newErrorResponse(request.Seq, request.Command, "ContinueRequest is not implemented"))
}
