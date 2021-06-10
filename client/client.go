package client

import (
	"context"
	"fmt"

	"filegogo/client/qrcode"
	"filegogo/client/share"
	"filegogo/libfgg"
	"filegogo/libfgg/transfer"

	"github.com/pion/webrtc/v3"

	bar "github.com/schollz/progressbar/v3"
	log "github.com/sirupsen/logrus"
)

type ClientConfig struct {
	Server string

	ShowQRcode   bool
	ShowProgress bool
	IcsServers   *webrtc.Configuration
	QRcodeConfig *qrcode.Config
	Level        string
}

type Client struct {
	Config *ClientConfig
	bar    *bar.ProgressBar
}

func NewClient(config *ClientConfig) (*Client, error) {
	return &Client{
		Config: config,
	}, nil
}

func (c *Client) Topic() string {
	return c.Config.Server + "/topic/"
}

func (t *Client) OnShare(addr string) {
	log.Println("=== WebSocket Connected ===")

	// Show QRcode
	if t.Config.ShowQRcode {
		fmt.Println()
		qrcode.ShowQRcode(addr, t.Config.QRcodeConfig)
		fmt.Println()
	}

	fmt.Println(addr)
	log.Println("=== =================== ===")
}

func (t *Client) OnPreTran(file *transfer.MetaFile) {
	if t.Config.ShowProgress {
		t.bar = bar.New64(file.Size)
	}
}

func (t *Client) OnProgress(c int64) {
	if t.Config.ShowProgress {
		t.bar.Add64(c)
	}
}

func (c *Client) Send(ctx context.Context, files []string) {
	fgg := libfgg.NewFgg()
	fgg.OnShare = c.OnShare
	fgg.Tran.OnProgress = c.OnProgress
	fgg.OnPreTran = c.OnPreTran

	fgg.UseWebsocket(share.ShareToWebSocket(c.Config.Server))
	if err := fgg.Send(files); err != nil {
		panic(err)
	}
	fgg.UseWebRTC(c.Config.IcsServers)
	if err := fgg.Run(); err != nil {
		fmt.Println()
		fmt.Println(err)
	} else {
		fmt.Println()
	}
}

func (c *Client) Recv(ctx context.Context, files []string) {
	fgg := libfgg.NewFgg()
	fgg.OnShare = c.OnShare
	fgg.Tran.OnProgress = c.OnProgress
	fgg.OnPreTran = func(t *transfer.MetaFile) {
		c.OnPreTran(t)
		go func() {
			fgg.RunWebRTC()
			fgg.GetFile()
		}()
	}

	fgg.UseWebsocket(share.ShareToWebSocket(c.Config.Server))
	if err := fgg.Recv(files); err != nil {
		panic(err)
	}
	fgg.UseWebRTC(c.Config.IcsServers)
	if err := fgg.Run(); err != nil {
		fmt.Println()
		fmt.Println(err)
	} else {
		fmt.Println()
		fmt.Println("md5 VerifyHash successful")
	}
}